#!/usr/bin/python3
"""Instrument C++17 source using Clang's AST, never a textual C++ parser.

Only initialized values of supported types are observed. Source edits are byte
offsets and contain no newlines, so diagnostics and events keep original lines.
The caller must run this compiler frontend inside the compilation sandbox.
"""
import argparse
import glob
import hashlib
import json
import os
import re
import sys
from pathlib import Path


def load_clang(runtime):
    if runtime:
        sys.path.insert(0, str(Path(runtime) / "usr/lib/python3/dist-packages"))
    from clang import cindex
    root = Path(runtime) if runtime else Path("/")
    libraries = sorted(glob.glob(str(root / "usr/lib/*/libclang-*.so.1")))
    if libraries:
        cindex.Config.set_library_file(libraries[-1])
    resources = sorted(glob.glob(str(root / "usr/lib/llvm-*/lib/clang/*/include")))
    return cindex, resources[-1] if resources else None


def compiler_options(resources):
    options = ["-std=c++17", "-x", "c++"]
    # Use identical header search paths when building and consuming the PCH.
    cpp_headers = sorted(glob.glob("/usr/include/c++/*"), key=lambda p: int(Path(p).name) if Path(p).name.isdigit() else 0)
    if cpp_headers:
        version = Path(cpp_headers[-1]).name
        for directory in [cpp_headers[-1], *glob.glob(f"/usr/include/*-linux-gnu/c++/{version}"), cpp_headers[-1] + "/backward"]:
            options += ["-isystem", directory]
    for directory in glob.glob("/usr/include/*-linux-gnu"):
        options += ["-isystem", directory]
    options += ["-isystem", "/usr/include"]
    if resources:
        options += ["-isystem", resources]
    return options


def stdlib_first(source):
    return bool(re.match(rb"\s*#\s*include\s*<bits/stdc\+\+\.h>[^\S\n]*(?:\n|$)", source))


def parse_source(ci, path, source, options, cache):
    pch = Path(cache) / "stdlib.pch"
    # Loading standard headers before a user's macros would change semantics.
    # Only accelerate sources which already include bits/stdc++.h first.
    if cache and stdlib_first(source) and pch.is_file():
        try:
            unit = ci.Index.create().parse(path, args=options + ["-include-pch", str(pch)])
            if not any(d.severity >= ci.Diagnostic.Error for d in unit.diagnostics):
                return unit
        except ci.TranslationUnitLoadError:
            pass
    # A stale or incompatible optional PCH must never disable visualization.
    return ci.Index.create().parse(path, args=options)


class Instrumenter:
    def __init__(self, cindex, unit, source, path):
        self.ci = cindex
        self.K = cindex.CursorKind
        self.unit = unit
        self.source = source
        self.path = path
        self.edits = []
        self.serial = 0
        self.prefix = "runspect_" + hashlib.sha256(source).hexdigest()[:10] + "_"
        self.graphs = set()
        self.sorting_vectors = set()
        self.aliases = {}
        self.strings = set()
        self.alias_targets = {}
        self.mutated = set()
        self.lengths = {}
        self.warnings = set()
        self.functions = []
        self.globals = {}
        self.global_offsets = {}
        self.variable_types = {}
        self.observed = set()
        self.reachable = set()
        self.current_reachable = False
        self.available = set()
        self.records = {}
        self.complete_records = set()
        self.ready_flags = None
        self.constexpr_function = False
        self.constexpr_guard = None
        self.heap_tracking = True
        self.unsafe_lifetime = False

    def own(self, node):
        return node.location.file and str(node.location.file) == self.path

    def children(self, node):
        return [c for c in node.get_children() if self.own(c)]

    def text(self, node):
        return self.source[node.extent.start.offset:node.extent.end.offset].decode("utf-8")

    def insert(self, offset, text):
        self.edits.append((offset, offset, text.encode("utf-8")))

    def replace(self, start, end, text):
        self.edits.append((start, end, text.encode("utf-8")))

    def end(self, node):
        end = node.extent.end.offset
        # Clang excludes the trailing semicolon for expression/return statements.
        while end < len(self.source) and self.source[end:end+1] in b" \t\r\n":
            end += 1
        if self.source[end:end+1] == b";":
            return end + 1
        return node.extent.end.offset

    def variable(self, node, initialized=False):
        name = node.spelling
        typ = node.type.get_canonical()
        if typ.kind in (self.ci.TypeKind.LVALUEREFERENCE, self.ci.TypeKind.RVALUEREFERENCE):
            typ = typ.get_pointee().get_canonical()
        if not name or not re.fullmatch(r"[A-Za-z_]\w*", name):
            return None
        if typ.is_volatile_qualified() or typ.kind in (
            self.ci.TypeKind.INVALID,
            self.ci.TypeKind.INCOMPLETEARRAY, self.ci.TypeKind.VARIABLEARRAY,
        ):
            return None
        if typ.kind == self.ci.TypeKind.POINTER and typ.get_pointee().kind in (self.ci.TypeKind.FUNCTIONPROTO, self.ci.TypeKind.FUNCTIONNOPROTO):
            return None
        # No arbitrary operator<<, pointer dereference, or reading indeterminate
        # scalars/arrays. Default-constructed standard containers are initialized.
        spelling = typ.spelling
        if self.unsafe_lifetime and typ.kind != self.ci.TypeKind.POINTER and not self.numeric(typ) and typ.kind != self.ci.TypeKind.ENUM:
            return None
        standard = any(part in spelling for part in (
            "std::vector<", "std::basic_string<", "std::array<", "std::deque<",
            "std::list<", "std::set<", "std::multiset<", "std::map<", "std::multimap<", "std::unordered_",
            "std::queue<", "std::stack<", "std::priority_queue<", "std::pair<",
            "std::tuple<", "std::optional<", "std::bitset<",
        ))
        tokens = [t.spelling for t in node.get_tokens()]
        has_init = initialized or standard or "=" in tokens or "{" in tokens
        if not has_init:
            # Function-style scalar initialization: int n(4).
            has_init = any(c.kind.is_expression() for c in self.children(node)) and "(" in tokens
        if "std::array<" in spelling and not initialized:
            has_init = "=" in tokens or "{" in tokens
            if not has_init:
                return None
        ready = None
        if not has_init:
            if typ.kind == self.ci.TypeKind.CONSTANTARRAY:
                return None
            if typ.kind != self.ci.TypeKind.RECORD:
                ready = self.prefix + "ready_" + str(node.location.offset)
        if not standard and typ.kind == self.ci.TypeKind.RECORD:
            definition = self.record_definition(typ)
            if not definition:
                self.warnings.add("Somente campos públicos de structs/classes nomeadas são expandidos; unions, structs locais e classes template permanecem opacos.")
                return None
            if "{" in tokens and self.aggregate_record(definition):
                self.complete_records.add(node.get_usr())
        self.variable_types[node.get_usr()] = typ
        return (name, node.get_usr(), node.location.line, ready)

    def type_name(self, typ):
        return re.sub(r"^(?:(?:const|volatile)\s+)+", "", typ.get_canonical().spelling).replace(" ", "")

    def record_definition(self, typ):
        if self.unsafe_lifetime: return None
        if typ.kind != self.ci.TypeKind.RECORD or self.type_name(typ).startswith("std::"):
            return None
        declaration = typ.get_declaration()
        definition = declaration.get_definition() or declaration
        if (not self.own(definition) or not definition.spelling or definition.kind not in (self.K.STRUCT_DECL, self.K.CLASS_DECL)
                or not definition.lexical_parent or definition.lexical_parent.kind not in (self.K.TRANSLATION_UNIT, self.K.NAMESPACE)
                or definition.semantic_parent != definition.lexical_parent):
            return None
        fields = [field for field in self.children(definition) if field.kind == self.K.FIELD_DECL and field.spelling
                  and field.access_specifier == self.ci.AccessSpecifier.PUBLIC]
        return definition if fields else None

    def aggregate_record(self, definition):
        return not any(child.kind in (self.K.CONSTRUCTOR, self.K.CXX_BASE_SPECIFIER) for child in self.children(definition))

    def record_accessors(self, definition):
        fields = [field for field in self.children(definition) if field.kind == self.K.FIELD_DECL and field.spelling
                  and field.access_specifier == self.ci.AccessSpecifier.PUBLIC]
        if not fields: return
        value = self.prefix + "object"
        result = self.prefix + "fields"
        code = f" inline std::vector<::runspect_auto::ObjectField> runspect_record_fields(const {definition.spelling}& {value}, bool initialized) {{ std::vector<::runspect_auto::ObjectField> {result};"
        for field in fields[:2048]:
            typ = field.type.get_canonical()
            tokens = [token.spelling for token in field.get_tokens()]
            default = "=" in tokens or "{" in tokens or (typ.kind == self.ci.TypeKind.RECORD and self.type_name(typ).startswith("std::") and not self.type_name(typ).startswith("std::array<"))
            ready = "true" if default else "initialized"
            if typ.kind in (self.ci.TypeKind.LVALUEREFERENCE, self.ci.TypeKind.RVALUEREFERENCE) or typ.is_volatile_qualified():
                message = "referência não expandida" if not typ.is_volatile_qualified() else "valor volatile não expandido"
                item = "::runspect_auto::ObjectField{" + json.dumps(field.spelling) + "," + json.dumps(message) + "}"
            elif field.is_bitfield():
                item = f"({ready} ? ::runspect_auto::object_field({json.dumps(field.spelling)},+{value}.{field.spelling},true) : ::runspect_auto::ObjectField{{{json.dumps(field.spelling)},\"inicialização não confirmada\"}})"
            else:
                item = f"::runspect_auto::object_field({json.dumps(field.spelling)},{value}.{field.spelling},{ready})"
            code += f" if({result}.size() < ::runspect_auto::max_items) {result}.push_back({item});"
        code += f" if({len(fields)} > ::runspect_auto::max_items) ::runspect_auto::items_limit(); return {result}; }}"
        code += f" inline const char* runspect_record_type(const {definition.spelling}*) {{ return {json.dumps(definition.type.spelling)}; }} "
        self.insert(self.end(definition), code)

    def reference_type(self, typ):
        typ = typ.get_canonical()
        if typ.kind == self.ci.TypeKind.POINTER or self.record_definition(typ): return True
        item = self.sequence_item(typ)
        return item is not None and self.reference_type(item)

    def sequence_item(self, typ):
        typ = typ.get_canonical()
        if typ.kind == self.ci.TypeKind.CONSTANTARRAY:
            return typ.get_array_element_type().get_canonical()
        spelling = self.type_name(typ)
        if any(spelling.startswith("std::" + name + "<") for name in (
            "vector", "array", "deque", "list", "set", "multiset", "unordered_set", "unordered_multiset", "basic_string",
        )):
            return typ.get_template_argument_type(0).get_canonical()
        return None

    def numeric(self, typ):
        return typ.get_canonical().kind in {
            self.ci.TypeKind.BOOL, self.ci.TypeKind.CHAR_U, self.ci.TypeKind.UCHAR,
            self.ci.TypeKind.CHAR16, self.ci.TypeKind.CHAR32, self.ci.TypeKind.USHORT,
            self.ci.TypeKind.UINT, self.ci.TypeKind.ULONG, self.ci.TypeKind.ULONGLONG,
            self.ci.TypeKind.UINT128, self.ci.TypeKind.CHAR_S, self.ci.TypeKind.SCHAR,
            self.ci.TypeKind.WCHAR, self.ci.TypeKind.SHORT, self.ci.TypeKind.INT,
            self.ci.TypeKind.LONG, self.ci.TypeKind.LONGLONG, self.ci.TypeKind.INT128,
            self.ci.TypeKind.FLOAT, self.ci.TypeKind.DOUBLE, self.ci.TypeKind.LONGDOUBLE,
        }

    def safe_item(self, typ):
        typ = typ.get_canonical()
        if typ.kind in (self.ci.TypeKind.LVALUEREFERENCE, self.ci.TypeKind.RVALUEREFERENCE):
            typ = typ.get_pointee().get_canonical()
        spelling = self.type_name(typ)
        if self.numeric(typ) or typ.kind == self.ci.TypeKind.ENUM or spelling == "std::basic_string<char>" or spelling.startswith("std::basic_string<char,"):
            return True
        if spelling.startswith("std::pair<"):
            return all(self.safe_item(typ.get_template_argument_type(i)) for i in (0, 1))
        if self.record_definition(typ): return True
        return False

    def observed_capability(self, usr):
        typ = self.variable_types[usr]
        spelling = self.type_name(typ)
        item = self.sequence_item(typ)
        if usr in self.graphs and item is not None:
            if self.sequence_item(item) is not None:
                return "graph"
            if self.type_name(item).startswith("std::pair<"):
                args = [item.get_template_argument_type(i).get_canonical() for i in (0, 1)]
                if all(self.numeric(arg) and arg.kind not in (self.ci.TypeKind.FLOAT, self.ci.TypeKind.DOUBLE, self.ci.TypeKind.LONGDOUBLE) for arg in args):
                    return "graph"
                return None
        if self.numeric(typ) or typ.kind == self.ci.TypeKind.ENUM:
            return "structures"
        if typ.kind == self.ci.TypeKind.POINTER or self.record_definition(typ): return "structures"
        if item is not None:
            if self.numeric(item):
                return "vectors"
            cell = self.sequence_item(item)
            if cell is not None:
                return "matrices" if self.safe_item(cell) or cell.kind == self.ci.TypeKind.POINTER else None
            if any(self.type_name(item).startswith("std::" + name + "<") for name in ("pair", "tuple", "optional", "bitset")):
                return "structures"
            return "structures" if self.safe_item(item) or item.kind == self.ci.TypeKind.POINTER else None
        if spelling.startswith("std::bitset<"):
            return "vectors"
        if any(spelling.startswith("std::" + name + "<") for name in (
            "pair", "tuple", "optional", "map", "multimap", "unordered_map", "unordered_multimap", "queue", "stack", "priority_queue",
        )):
            if any(spelling.startswith("std::" + name + "<") for name in ("queue", "stack", "priority_queue")):
                item = typ.get_template_argument_type(0).get_canonical()
                if not self.safe_item(item):
                    return None
            return "structures"
        return None

    def reachable_functions(self):
        functions = {function.get_usr(): function for function in self.functions}
        offsets = {offset: usr for usr, function in functions.items() for offset in (function.extent.start.offset, function.location.offset)}
        pending = [usr for usr, function in functions.items() if function.spelling == "main"]
        while pending:
            usr = pending.pop()
            if usr in self.reachable:
                continue
            self.reachable.add(usr)
            for node in self.descendants(functions[usr]):
                # Function references also cover callback arguments and aliases.
                if node.referenced:
                    target = node.referenced.get_usr()
                    if target not in functions and self.own(node.referenced):
                        target = offsets.get(node.referenced.extent.start.offset) or offsets.get(node.referenced.location.offset)
                        if target is None and node.referenced.kind in (self.K.FUNCTION_DECL, self.K.CXX_METHOD):
                            target = next((candidate for candidate, function in functions.items()
                                           if function.spelling == node.referenced.spelling
                                           and function.extent.start.offset <= node.referenced.location.offset < function.extent.end.offset), None)
                    if target in functions: pending.append(target)

    def source_capabilities(self, manual=False):
        available = set(self.available) if not manual else set()
        for function in self.functions:
            if function.get_usr() not in self.reachable:
                continue
            for node in self.descendants(function):
                if node.kind != self.K.CALL_EXPR or not node.referenced:
                    continue
                target = node.referenced
                parent = target.semantic_parent
                if manual and parent and parent.kind == self.K.NAMESPACE and parent.spelling == "viz":
                    if target.spelling in ("add_node", "add_edge"):
                        available.add("graph")
                    elif target.spelling in ("vector_init", "vector_result"):
                        available.add("vectors")
                    elif target.spelling == "show":
                        available.add("structures")
                    elif target.spelling == "show_matrix":
                        available.add("matrices")
                refs = [sub for sub in self.descendants(node) if sub.kind == self.K.DECL_REF_EXPR and sub.referenced]
                if node.spelling == "operator<<" and any(sub.spelling in ("cout", "wcout") and sub.referenced.semantic_parent and sub.referenced.semantic_parent.spelling == "std" for sub in refs):
                    available.add("output")
                if not self.own(target) and target.spelling in ("printf", "puts", "putchar", "wprintf", "putwchar"):
                    available.add("output")
                if not self.own(target) and target.spelling in ("fprintf", "fputs", "fputc", "fwrite") and any(sub.spelling == "stdout" for sub in refs):
                    available.add("output")
        return sorted(available)

    def collect(self, node, globals_allowed=True):
        for child in self.children(node):
            if child.kind in (self.K.FUNCTION_DECL, self.K.CXX_METHOD, self.K.FUNCTION_TEMPLATE, self.K.DESTRUCTOR):
                if child.is_definition():
                    self.functions.append(child)
            elif child.kind == self.K.VAR_DECL and globals_allowed and child.is_definition():
                if child.semantic_parent and child.semantic_parent.kind in (self.K.CLASS_DECL,self.K.STRUCT_DECL):
                    # An out-of-class static member definition still requires
                    # its class qualifier outside member function bodies.
                    continue
                v = self.variable(child, initialized=True)
                if v:
                    self.globals[v[0]] = v
                    self.global_offsets[v[1]] = child.extent.start.offset
            elif child.kind in (self.K.NAMESPACE, self.K.STRUCT_DECL, self.K.CLASS_DECL):
                if child.kind in (self.K.STRUCT_DECL, self.K.CLASS_DECL) and child.is_definition() and self.record_definition(child.type):
                    self.records[child.get_usr()] = child
                self.collect(child, globals_allowed=False)

    def inspect_patterns(self, node):
        if node.kind == self.K.VAR_DECL:
            name = node.spelling.lower()
            if "basic_string<char" in node.type.get_canonical().spelling:
                self.strings.add(node.get_usr())
            if re.fullmatch(r"(?:g|adj|adjacency|graph|grafo|edges|arestas)(?:_\w+)?", name):
                self.graphs.add(node.get_usr())
            # A numeric vector constructed from a string is a visual alias.
            text = self.text(node)
            match = re.search(r"\b([A-Za-z_]\w*)\.begin\s*\(\s*\)\s*,\s*\1\.end\s*\(\s*\)", text)
            if match and "vector<" in node.type.get_canonical().spelling:
                refs = [sub for sub in self.descendants(node) if sub.kind == self.K.DECL_REF_EXPR and sub.spelling == match.group(1) and sub.referenced]
                if refs and "basic_string<char" in refs[0].referenced.type.get_canonical().spelling:
                    usr = refs[0].referenced.get_usr()
                    self.aliases[usr] = node.spelling
                    self.alias_targets[usr] = node.get_usr()
            size = re.search(r"\b([A-Za-z_]\w*)\.size\s*\(\s*\)", text)
            if size:
                refs = [sub for sub in self.descendants(node) if sub.kind == self.K.DECL_REF_EXPR and sub.spelling == size.group(1) and sub.referenced]
                if refs: self.lengths[node.get_usr()] = refs[0].referenced.get_usr()
        if node.kind == self.K.BINARY_OPERATOR:
            kids = self.children(node)
            if len(kids) == 2 and self.source[kids[0].extent.end.offset:kids[1].extent.start.offset].strip() in (b"<", b">", b"<=", b">="):
                # A comparison between positions of the same container is
                # evidence of ordering; runtime still verifies the final order.
                positions = [re.fullmatch(r"([A-Za-z_]\w*)\s*\[[\s\S]+\]", self.text(kid)) for kid in kids]
                if all(positions) and positions[0].group(1) == positions[1].group(1):
                    for sub in self.descendants(kids[0]):
                        if sub.kind == self.K.DECL_REF_EXPR and sub.referenced and sub.spelling == positions[0].group(1):
                            self.sorting_vectors.add(sub.referenced.get_usr())
            if len(kids) >= 2 and self.source[kids[0].extent.end.offset:kids[1].extent.start.offset].strip() == b"=":
                for sub in [kids[0], *self.descendants(kids[0])]:
                    if sub.kind == self.K.DECL_REF_EXPR and sub.referenced:
                        self.mutated.add(sub.referenced.get_usr())
        if node.kind == self.K.CALL_EXPR and node.spelling in ("sort", "stable_sort", "reverse", "swap", "fill", "push_back", "erase", "clear", "resize", "assign"):
            for sub in self.descendants(node):
                if sub.kind == self.K.DECL_REF_EXPR and sub.referenced:
                    self.mutated.add(sub.referenced.get_usr())
                    if node.spelling in ("sort", "stable_sort"):
                        self.sorting_vectors.add(sub.referenced.get_usr())
        if node.kind == self.K.CALL_EXPR and node.spelling in ("push_back", "emplace_back"):
            # adjacency[u].push_back(v), including arbitrary variable names.
            for sub in self.descendants(node):
                if sub.kind == self.K.DECL_REF_EXPR and sub.referenced:
                    typ = sub.referenced.type.get_canonical().spelling
                    if "vector<std::vector<" in typ.replace(" ", ""):
                        self.graphs.add(sub.referenced.get_usr())
        for child in self.children(node):
            self.inspect_patterns(child)

    def descendants(self, node):
        for child in self.children(node):
            yield child
            yield from self.descendants(child)

    def frame(self, scope, line, caption=None, defer_graph=None):
        self.serial += 1
        frame = self.prefix + str(self.serial)
        caption = caption or f"Linha {line}"
        calls = []
        for name, usr, _, ready in scope.values():
            if usr == defer_graph:
                continue
            display = self.aliases.get(usr, name)
            if display != name and display in scope and scope[display][1] == self.alias_targets[usr]:
                continue
            if self.current_reachable:
                self.observed.add(usr)
            method = "graph" if usr in self.graphs else "observe"
            arguments = ""
            if method == "observe":
                arguments = "," + ("true" if usr in self.sorting_vectors else "false")
                arguments += "," + ("true" if usr in self.complete_records else "false")
            call = f"{frame}.{method}({json.dumps(display, ensure_ascii=True)},{name}{arguments});"
            calls.append((f"if({ready}) {{ {call} }} else {frame}.uninitialized({json.dumps(display)});" if ready else call))
        code = "{ ::runspect_auto::Frame " + frame + "(" + json.dumps(caption) + "," + str(line) + ");" + "".join(calls) + "}"
        return "if(!::runspect_auto::constant_evaluation()) ([&]() " + code + ")();" if self.constexpr_function else code

    def refs_written(self, node):
        """Recognize a direct initialized scalar assignment, not a read-modify-write."""
        if node.kind == self.K.BINARY_OPERATOR:
            kids = self.children(node)
            if len(kids) >= 2 and kids[0].kind == self.K.DECL_REF_EXPR:
                between = self.source[kids[0].extent.end.offset:kids[1].extent.start.offset].strip()
                if between == b"=" and kids[0].referenced:
                    return [kids[0].referenced]
        return []

    def initialize_written(self, node, scope):
        updates = []
        for var in self.refs_written(node):
            current = scope.get(var.spelling)
            if current and current[3]:
                updates.append(current[3] + "=true;")
        if node.kind == self.K.CALL_EXPR and node.spelling == "operator>>":
            refs = [sub for sub in self.descendants(node) if sub.kind == self.K.DECL_REF_EXPR]
            if any(sub.spelling == "cin" for sub in refs):
                updates.append(f"::runspect_auto::check_input(std::cin,{node.location.line});")
                for call in [node, *self.descendants(node)]:
                    if call.kind != self.K.CALL_EXPR or call.spelling != "operator>>": continue
                    args = list(call.get_arguments())
                    if not args: continue
                    target = args[-1]
                    while target.kind == self.K.UNEXPOSED_EXPR and len(self.children(target)) == 1:
                        target = self.children(target)[0]
                    current = scope.get(target.spelling) if target.kind == self.K.DECL_REF_EXPR else None
                    if current and current[3]: updates.append(f"if(std::cin) {current[3]}=true;")
        return "".join(dict.fromkeys(updates))

    def snapshot_write(self, node, scope):
        # A simple scalar index is safe to observe after a numeric assignment.
        # Complex/side-effecting indices stay with state-diff observation.
        if node.kind != self.K.BINARY_OPERATOR: return ""
        kids = self.children(node)
        if len(kids) != 2: return ""
        lhs, rhs = kids
        if self.source[lhs.extent.end.offset:rhs.extent.start.offset].strip() != b"=": return ""
        match = re.fullmatch(r"([A-Za-z_]\w*)\s*\[\s*([A-Za-z_]\w*|[0-9]+)\s*\]", self.text(lhs))
        if not match or match.group(1) not in scope: return ""
        name, index = match.groups()
        if scope[name][1] in self.graphs: return ""
        if not index.isdigit():
            refs = [sub for sub in self.descendants(lhs) if sub.kind == self.K.DECL_REF_EXPR and sub.spelling == index and sub.referenced]
            if not refs: return ""
            typ = refs[0].referenced.type.get_canonical()
            integer_types = {self.ci.TypeKind.BOOL,self.ci.TypeKind.CHAR_U,self.ci.TypeKind.UCHAR,self.ci.TypeKind.CHAR16,self.ci.TypeKind.CHAR32,self.ci.TypeKind.USHORT,self.ci.TypeKind.UINT,self.ci.TypeKind.ULONG,self.ci.TypeKind.ULONGLONG,self.ci.TypeKind.CHAR_S,self.ci.TypeKind.SCHAR,self.ci.TypeKind.WCHAR,self.ci.TypeKind.SHORT,self.ci.TypeKind.INT,self.ci.TypeKind.LONG,self.ci.TypeKind.LONGLONG}
            if typ.is_volatile_qualified() or typ.kind not in integer_types: return ""
        display = self.aliases.get(scope[name][1],name)
        return f"::runspect_auto::written({json.dumps(display)},{name},{index},{node.location.line});"

    def match_written(self, node, scope):
        # Recognize the usual substring position formula, then let the runtime
        # verify actual text/pattern equality before announcing a match.
        if node.kind != self.K.BINARY_OPERATOR:
            return ""
        tokens = [t.spelling for t in node.get_tokens()]
        if len(tokens) != 7 or tokens[1] != "=" or tokens[3] != "-" or tokens[5:] != ["+", "1"]:
            return ""
        position, length = tokens[0], tokens[4]
        if position not in scope or length not in scope:
            return ""
        pattern = self.lengths.get(scope[length][1])
        displays = {v[1]: self.aliases.get(v[1], v[0]) for v in scope.values() if v[1] in self.strings}
        text_names = [usr for usr in displays if usr != pattern]
        if pattern not in displays or len(text_names) != 1:
            return ""
        return f"::runspect_auto::match({json.dumps(displays[text_names[0]])},{json.dumps(displays[pattern])},{position},{length},{node.location.line});"

    def reads(self, node, scope):
        if self.constexpr_function: return
        # Replace only a named container's subscript. The index is evaluated
        # exactly once by read(), which returns the original reference/proxy.
        # Mutation sites are excluded: this hook describes reads/comparisons.
        kind = node.kind
        if kind in (self.K.LAMBDA_EXPR, self.K.UNARY_OPERATOR, self.K.CXX_UNARY_EXPR, self.K.CXX_TYPEID_EXPR):
            return
        if kind == self.K.BINARY_OPERATOR:
            kids = self.children(node)
            if len(kids) >= 2:
                op = self.source[kids[0].extent.end.offset:kids[1].extent.start.offset].strip()
                if op in (b"=", b"+=", b"-=", b"*=", b"/=", b"%=", b"&=", b"|=", b"^="):
                    self.reads(kids[1], scope)
                    self.matrix_access(kids[0], scope, write=True)
                    return
        if kind == self.K.CALL_EXPR and node.spelling not in ("operator[]", "operator==", "operator!=", "operator<", "operator>"):
            # Calls can mutate reference arguments (swap, cin >>, custom funcs).
            return
        if kind in (self.K.ARRAY_SUBSCRIPT_EXPR, self.K.CALL_EXPR) and (kind != self.K.CALL_EXPR or node.spelling == "operator[]"):
            if self.matrix_access(node,scope):
                return
            text = self.text(node)
            match = re.fullmatch(r"([A-Za-z_]\w*)\s*\[([\s\S]+)\]", text)
            if match and match.group(1) in scope and "[" not in match.group(2):
                name = match.group(1)
                usr = scope[name][1]
                # Nested matrix rows and custom containers are excluded by type.
                typ = node.type.get_canonical()
                container = self.variable_types[usr]
                supported = self.sequence_item(container) is not None or self.type_name(container).startswith("std::bitset<")
                if supported and (usr in self.graphs or typ.kind not in (self.ci.TypeKind.RECORD, self.ci.TypeKind.LVALUEREFERENCE) or "bool" in typ.spelling):
                    display = self.aliases.get(usr, name)
                    self.replace(node.extent.start.offset, node.extent.end.offset,
                                 f"::runspect_auto::read({json.dumps(display)},{name},({match.group(2)}),{node.location.line})")
                    return
        for child in self.children(node):
            self.reads(child, scope)

    def matrix_access(self, node, scope, write=False):
        if self.constexpr_function: return False
        match = re.fullmatch(r"([A-Za-z_]\w*)\s*\[([^\[\]]+)\]\s*\[([^\[\]]+)\]",self.text(node))
        if not match or match.group(1) not in scope or scope[match.group(1)][1] in self.graphs:
            return False
        typ = node.type.get_canonical()
        if typ.kind in (self.ci.TypeKind.RECORD,self.ci.TypeKind.POINTER) and "bool" not in typ.spelling:
            return False
        name,row,col = match.groups()
        item = self.sequence_item(self.variable_types[scope[name][1]])
        if item is None or self.sequence_item(item) is None: return False
        display = self.aliases.get(scope[name][1],name)
        # Calling a method on the row wrapper sequences row evaluation before
        # column evaluation, just as the two original [] expressions do.
        self.replace(node.extent.start.offset,node.extent.end.offset,
            f"::runspect_auto::matrix_row({json.dumps(display)},{name},({row}),{node.location.line}).at(({col}),{'true' if write else 'false'})")
        return True

    def search_condition(self, node):
        # Only a direct equality with one subscript is a value lookup. Do not
        # mistake loop bounds, two-container comparisons or graph metadata for
        # a successful search. The original expression is evaluated only once.
        while node.kind in (self.K.UNEXPOSED_EXPR, self.K.PAREN_EXPR) and len(self.children(node)) == 1:
            node = self.children(node)[0]
        if node.kind != self.K.BINARY_OPERATOR:
            return False
        kids = self.children(node)
        if len(kids) != 2 or self.source[kids[0].extent.end.offset:kids[1].extent.start.offset].strip() != b"==":
            return False
        positions = [re.fullmatch(r"([A-Za-z_]\w*)\s*\[[\s\S]+\]", self.text(kid)) for kid in kids]
        if sum(position is not None for position in positions) != 1:
            return False
        position = next(position for position in positions if position)
        if self.graphs and re.fullmatch(r"(?:dist|distance|distancia|d|pai|parent|prev|predecessor|vis|visited|visitado|seen)(?:_\w+)?", position.group(1).lower()):
            return False
        other = kids[1] if positions[0] else kids[0]
        return not any(sub.kind in (self.K.ARRAY_SUBSCRIPT_EXPR, self.K.CALL_EXPR) for sub in [other, *self.descendants(other)])

    def adjacency_insertion(self, node):
        # Only direct calls with side-effect-free endpoints can be grouped.
        # AST identity distinguishes shadowed containers; token matching here
        # restricts the supported argument forms, without rewriting C++ values.
        while node.kind == self.K.UNEXPOSED_EXPR and len(self.children(node)) == 1:
            node = self.children(node)[0]
        if node.kind != self.K.CALL_EXPR or node.spelling not in ("push_back", "emplace_back"):
            return None
        text = "".join(token.spelling for token in node.get_tokens())
        atom = r"(?:[A-Za-z_]\w*|[0-9]+)"
        match = re.fullmatch(r"([A-Za-z_]\w*)\[(" + atom + r")\]\.(push_back|emplace_back)\((.*)\)", text)
        if not match:
            return None
        name, source, method, argument = match.groups()
        target, weight = argument, "1"
        if argument.startswith("{") and argument.endswith("}"):
            argument = argument[1:-1]
        elif argument.startswith("make_pair(") or argument.startswith("std::make_pair("):
            argument = argument[argument.index("(") + 1:-1]
        if "," in argument:
            parts = argument.split(",")
            if len(parts) != 2:
                return None
            target, weight = parts
        elif method == "push_back":
            target = argument
        if not re.fullmatch(atom, target) or not re.fullmatch(atom, weight):
            return None
        refs = [sub.referenced for sub in self.descendants(node)
                if sub.kind == self.K.DECL_REF_EXPR and sub.spelling == name and sub.referenced]
        if not refs or refs[0].get_usr() not in self.graphs:
            return None
        return refs[0].get_usr(), source, target, weight

    def block(self, node, inherited, entry=False, jump_scope=False):
        scope = dict(inherited)
        start, end = node.extent.start.offset, node.extent.end.offset
        if entry:
            self.insert(start + 1, self.frame(scope, node.location.line, "Início da função"))
        statements = self.children(node)
        deferred = {}
        index = 0
        while index + 1 < len(statements):
            first = self.adjacency_insertion(statements[index])
            second = self.adjacency_insertion(statements[index + 1])
            if first and second == (first[0], first[2], first[1], first[3]):
                # An undirected insertion is complete after both adjacency
                # writes. Keep the intermediate execution frame, observing
                # other variables but not a temporarily asymmetric graph.
                deferred[index] = first[0]
                index += 2
            else:
                index += 1
        for index, stmt in enumerate(statements):
            self.statement(stmt, scope, deferred.get(index), jump_scope=jump_scope)
        if not statements or not self.terminates(statements[-1]):
            self.insert(end - 1, self.frame(scope, node.extent.end.line, "Fim do bloco"))

    def terminates(self, node):
        if node.kind in (self.K.RETURN_STMT, self.K.CXX_THROW_EXPR, self.K.BREAK_STMT, self.K.CONTINUE_STMT, self.K.GOTO_STMT): return True
        children = self.children(node)
        if node.kind == self.K.COMPOUND_STMT: return bool(children) and self.terminates(children[-1])
        if node.kind == self.K.IF_STMT: return len(children) >= 3 and all(self.terminates(child) for child in children[-2:])
        return False

    def body(self, node, scope, jump_scope=False):
        if node.kind == self.K.COMPOUND_STMT:
            self.block(node, scope, jump_scope=jump_scope)
        else:
            # Braces preserve the original controlled statement and dangling
            # else relationships. Declarations keep their original scope.
            self.insert(node.extent.start.offset, "{")
            self.statement(node, dict(scope), jump_scope=jump_scope)
            self.insert(self.end(node), "}")

    def statement(self, node, scope, defer_graph=None, jump_scope=False):
        K = self.K
        kind = node.kind
        if kind == K.COMPOUND_STMT:
            self.block(node, scope)
            return
        if kind == K.DECL_STMT:
            guards = []
            for var in self.children(node):
                if var.kind != K.VAR_DECL:
                    continue
                # Instrument lambda bodies with captured variables and params.
                for sub in self.descendants(var):
                    if sub.kind == K.LAMBDA_EXPR:
                        local = dict(scope)
                        for param in self.children(sub):
                            if param.kind == K.PARM_DECL:
                                v = self.variable(param, initialized=True)
                                if v:
                                    local[v[0]] = v
                        for body in self.children(sub):
                            if body.kind == K.COMPOUND_STMT and self.children(body):
                                old_flags, self.ready_flags = self.ready_flags, set()
                                first_edit = len(self.edits)
                                self.call_guard(body, "lambda", self.children(sub))
                                self.block(body, local, entry=True)
                                self.hoist_flags(body, first_edit)
                                self.ready_flags = old_flags
                        break
                v = self.variable(var)
                self.reads(var, scope)
                if v:
                    scope[v[0]] = v
                    local = f"::runspect_auto::local({json.dumps(self.aliases.get(v[1],v[0]))});"
                    guards.append(f"if(!::runspect_auto::constant_evaluation()) {{ {local} }}" if self.constexpr_function else local)
                    if v[3]:
                        self.ready_flags.add(v[3])
                        guards.append(f"{v[3]}=false;")
            self.insert(self.end(node), "".join(guards) + self.frame(scope, node.location.line))
            return
        if kind == K.SWITCH_STMT:
            kids = self.children(node)
            if not kids:
                return
            body = kids[-1]
            local = dict(scope)
            # Some libclang versions omit C++17 switch init-statements from
            # get_children(). Recover their declarations from resolved refs.
            for sub in self.descendants(node):
                if sub.kind == K.DECL_REF_EXPR and sub.referenced:
                    var = sub.referenced
                    if var.kind == K.VAR_DECL and node.extent.start.offset < var.extent.start.offset < body.extent.start.offset:
                        v = self.variable(var)
                        if v and not v[3]:
                            local[v[0]] = v
                        else:
                            local.pop(var.spelling, None)
            # Keep the integral/enum switch condition and its single evaluation.
            for expr in kids[:-1]:
                self.reads(expr, local)
            self.insert(node.extent.start.offset, self.frame(scope, node.location.line, "Seleção do switch"))
            self.body(body, local, jump_scope=True)
            if not self.terminates(node): self.insert(self.end(node), self.frame(scope, node.location.line))
            return
        if kind in (K.CASE_STMT, K.DEFAULT_STMT):
            kids = self.children(node)
            if kids:
                stmt = kids[-1]
                caption = "Caso padrão" if kind == K.DEFAULT_STMT else "Caso " + self.text(kids[0])
                self.insert(stmt.extent.start.offset, self.frame(scope, node.location.line, caption))
                self.statement(stmt, scope, jump_scope=jump_scope)
            return
        if kind == K.UNEXPOSED_STMT and "fallthrough" in [t.spelling for t in node.get_tokens()]:
            # The attribute must remain immediately before the next case.
            self.insert(node.extent.start.offset, self.frame(scope, node.location.line))
            return
        if kind in (K.FOR_STMT, K.CXX_FOR_RANGE_STMT, K.WHILE_STMT, K.DO_STMT, K.IF_STMT):
            compile_condition = kind == K.IF_STMT and any(t.spelling == "constexpr" for t in list(node.get_tokens())[:3])
            kids = self.children(node)
            local = dict(scope)
            # Last child is the body for loops; if has then and optional else.
            if kind == K.IF_STMT:
                tokens = [t.spelling for t in node.get_tokens()]
                # Use AST child offsets to find the closing condition paren.
                paren_depth = 0
                close = node.extent.start.offset
                for token in node.get_tokens():
                    if token.spelling == "(":
                        paren_depth += 1
                    elif token.spelling == ")":
                        paren_depth -= 1
                        if paren_depth == 0:
                            close = token.extent.end.offset
                            break
                bodies = [c for c in kids if c.extent.start.offset >= close]
                expressions = [c for c in kids if c not in bodies]
            else:
                bodies = kids[:1] if kind == K.DO_STMT else kids[-1:]
                expressions = [c for c in kids if c not in bodies]
            conditions = []
            if kind in (K.IF_STMT, K.WHILE_STMT, K.DO_STMT):
                conditions = [e for e in expressions if e.kind.is_expression()][-1:]
            elif kind == K.FOR_STMT:
                separators = []
                depth = 0
                for token in node.get_tokens():
                    if token.spelling == "(": depth += 1
                    elif token.spelling == ")":
                        depth -= 1
                        if depth == 0: break
                    elif token.spelling == ";" and depth == 1:
                        separators.append(token.extent.start.offset)
                if len(separators) == 2:
                    conditions = [e for e in expressions if separators[0] < e.extent.start.offset < separators[1]]
            for expr in expressions:
                if expr.kind == K.DECL_STMT:
                    for var in self.children(expr):
                        v = self.variable(var) if var.kind == K.VAR_DECL else None
                        if v:
                            if v[3]: continue
                            local[v[0]] = v
                elif expr.kind == K.VAR_DECL:
                    v = self.variable(expr, initialized=True)
                    if v:
                        local[v[0]] = v
                else:
                    self.reads(expr, local)
                    if expr in conditions and not compile_condition and not self.constexpr_function:
                        search = ",true" if kind == K.IF_STMT and self.search_condition(expr) else ""
                        self.insert(expr.extent.start.offset, "::runspect_auto::condition(static_cast<bool>((")
                        self.insert(expr.extent.end.offset, "))," + str(expr.location.line) + search + ")")
            for body in bodies:
                self.body(body, local)
            if not self.terminates(node): self.insert(self.end(node), self.frame(scope, node.location.line))
            return
        if kind in (K.RETURN_STMT, K.BREAK_STMT, K.CONTINUE_STMT):
            self.insert(node.extent.start.offset, self.frame(scope, node.location.line))
            self.reads(node, scope)
            if kind == K.RETURN_STMT and self.constexpr_guard:
                expressions = self.children(node)
                if expressions:
                    expr = expressions[-1]
                    self.insert(expr.extent.start.offset, "::runspect_auto::constexpr_result((")
                    self.insert(expr.extent.end.offset, ")," + self.constexpr_guard + ")")
                else:
                    self.insert(node.extent.start.offset, f"if(!::runspect_auto::constant_evaluation()) delete {self.constexpr_guard};")
            return
        if kind == K.LABEL_STMT:
            kids = self.children(node)
            if kids:
                self.insert(kids[-1].extent.start.offset, self.frame(scope, node.location.line, "Rótulo " + node.spelling))
                self.statement(kids[-1], scope, jump_scope=jump_scope)
            return
        if kind == K.GOTO_STMT:
            self.insert(node.extent.start.offset, self.frame(scope, node.location.line, "Salto: " + self.text(node).rstrip(";")))
            return
        if kind == K.CXX_TRY_STMT:
            self.insert(node.extent.start.offset, self.frame(scope, node.location.line, "Início do try"))
            for child in self.children(node): self.statement(child, dict(scope))
            self.insert(self.end(node), self.frame(scope, node.location.line, "Fim do try/catch"))
            return
        if kind == K.CXX_CATCH_STMT:
            local = dict(scope)
            for child in self.children(node):
                if child.kind in (K.VAR_DECL, K.PARM_DECL):
                    v = self.variable(child, initialized=True)
                    if v: local[v[0]] = v
                elif child.kind == K.COMPOUND_STMT:
                    self.insert(child.extent.start.offset + 1, self.frame(local, node.location.line, "Captura de exceção"))
                    self.block(child, local)
            return
        if kind == K.CXX_THROW_EXPR:
            self.insert(node.extent.start.offset, self.frame(scope, node.location.line, "Lança exceção"))
            return
        # Readiness flags become true only after a write actually executes.
        self.reads(node, scope)
        self.insert(self.end(node), self.initialize_written(node, scope) + ("" if self.constexpr_function else self.snapshot_write(node, scope)) + self.frame(scope, node.location.line, defer_graph=defer_graph) + ("" if self.constexpr_function else self.match_written(node, scope)))

    def hoist_flags(self, body, first_edit):
        # A jump may skip an uninitialized scalar declaration. Its readiness
        # flag belongs at function entry so instrumentation adds no forbidden
        # initialization across labels/cases, and never reads the skipped value.
        if self.ready_flags:
            code = "".join(f"bool {name}=false;" for name in sorted(self.ready_flags))
            offset = body.extent.start.offset + 1
            self.edits.insert(first_edit, (offset, offset, code.encode("utf-8")))

    def call_guard(self, body, name, parameters):
        if self.current_reachable and name != "main":
            self.available.add("calls")
        self.serial += 1
        guard = self.prefix + "call_" + str(self.serial)
        if self.constexpr_function:
            self.constexpr_guard = guard
            code = f"::runspect_auto::Call* {guard}=::runspect_auto::constant_evaluation() ? nullptr : ::runspect_auto::constexpr_call({json.dumps(name)},{body.location.line});"
            for param in parameters:
                if param.kind == self.K.PARM_DECL and self.variable(param, initialized=True) and param.type.kind not in (self.ci.TypeKind.LVALUEREFERENCE, self.ci.TypeKind.RVALUEREFERENCE):
                    code += f"if({guard}) {guard}->local({json.dumps(param.spelling)});"
            self.insert(body.extent.start.offset + 1, code)
            return
        locals = []
        for param in parameters:
            if param.kind != self.K.PARM_DECL:
                continue
            v = self.variable(param, initialized=True)
            if v and param.type.kind not in (self.ci.TypeKind.LVALUEREFERENCE,self.ci.TypeKind.RVALUEREFERENCE):
                locals.append(f"{guard}.local({json.dumps(v[0])});")
        self.insert(body.extent.start.offset+1,f"::runspect_auto::Call {guard}({json.dumps(name)},{body.location.line});" + "".join(locals))

    def allocations(self, function):
        for node in self.descendants(function):
            if node.kind == self.K.CXX_NEW_EXPR and self.heap_tracking:
                typ = node.type.get_pointee().get_canonical()
                if not (self.record_definition(typ) or self.numeric(typ) or typ.kind == self.ci.TypeKind.ENUM): continue
                tokens = [token.spelling for token in node.get_tokens()]
                new_index = tokens.index("new") if "new" in tokens else 0
                prefix = tokens[new_index + 1:]
                boundary = next((index for index, token in enumerate(prefix) if token in ("(", "{")), len(prefix))
                if "[" in prefix[:boundary] or prefix[:1] == ["("]:
                    self.warnings.add("New[] e placement new mostram apenas referências, sem expandir a alocação.")
                    continue
                initialized = ("{" in tokens or "(" in tokens) and (self.numeric(typ) or typ.kind == self.ci.TypeKind.ENUM or self.aggregate_record(self.record_definition(typ)))
                self.insert(node.extent.start.offset, "::runspect_auto::allocated((")
                self.insert(node.extent.end.offset, ")," + ("true" if initialized else "false") + ")")
            elif node.kind == self.K.CXX_DELETE_EXPR:
                expressions = [child for child in self.children(node) if child.kind.is_expression()]
                if expressions:
                    expr = expressions[-1]
                    self.insert(expr.extent.start.offset, "::runspect_auto::before_delete((")
                    self.insert(expr.extent.end.offset, "))")

    def constexpr_traceable(self, function, visiting=None):
        # C++17 cannot use a non-literal RAII guard in a constexpr body. The
        # runtime guard is retired by numeric returns, so reject every path
        # that can leave through an exception, including constexpr callees.
        if not self.numeric(function.result_type): return False
        visiting = set() if visiting is None else set(visiting)
        identity = function.get_usr()
        if identity in visiting: return True
        visiting.add(identity)
        for node in self.descendants(function):
            if node.kind in (self.K.CXX_THROW_EXPR, self.K.CXX_TRY_STMT, self.K.CXX_NEW_EXPR, self.K.CXX_DELETE_EXPR, self.K.LAMBDA_EXPR): return False
            if node.kind == self.K.CALL_EXPR:
                callee = node.referenced
                if not callee or "constexpr" not in [token.spelling for token in callee.get_tokens()]: return False
                definition = callee.get_definition()
                if definition and self.own(definition) and not self.constexpr_traceable(definition, visiting): return False
        return True

    def run(self):
        self.collect(self.unit.cursor)
        self.reachable_functions()
        for function in self.functions:
            self.inspect_patterns(function)
        for node in self.descendants(self.unit.cursor):
            managed = any(name in node.type.get_canonical().spelling for name in ("std::unique_ptr<", "std::shared_ptr<"))
            explicit_destructor = node.kind == self.K.CALL_EXPR and node.referenced and node.referenced.kind == self.K.DESTRUCTOR
            direct_deallocation = node.kind == self.K.CALL_EXPR and node.spelling in ("operator delete", "operator delete[]")
            placement = node.kind == self.K.CXX_NEW_EXPR and re.match(r"\s*(?:::\s*)?new\s*\(", self.text(node))
            if managed or explicit_destructor or placement or direct_deallocation:
                self.heap_tracking = False
            if explicit_destructor or placement:
                self.unsafe_lifetime = True
        if not self.heap_tracking:
            self.warnings.add("Ownership gerenciado, placement new ou destruição explícita: referências são identificadas, mas alocações não são expandidas automaticamente neste programa.")
        if self.unsafe_lifetime:
            self.warnings.add("Com destruição explícita ou placement new, registros, strings e containers permanecem opacos para evitar leituras fora do lifetime.")
            self.globals = {name: value for name, value in self.globals.items()
                            if self.variable_types[value[1]].kind == self.ci.TypeKind.POINTER or self.numeric(self.variable_types[value[1]]) or self.variable_types[value[1]].kind == self.ci.TypeKind.ENUM}
        else:
            for definition in self.records.values(): self.record_accessors(definition)
        self.sorting_vectors.intersection_update(self.mutated)
        self.aliases = {usr: name for usr, name in self.aliases.items() if usr not in self.mutated and self.alias_targets[usr] not in self.mutated}
        for function in self.functions:
            self.current_reachable = function.get_usr() in self.reachable
            bodies = [c for c in self.children(function) if c.kind == self.K.COMPOUND_STMT]
            boundary = bodies[0].extent.start.offset if bodies else function.extent.end.offset
            tokens = [t.spelling for t in function.get_tokens() if t.extent.start.offset < boundary]
            self.constexpr_function = "constexpr" in tokens
            self.constexpr_guard = None
            if self.constexpr_function and not self.constexpr_traceable(function):
                self.warnings.add("Constexpr com retorno não numérico ou lifetime/exceções é observado somente pelo chamador.")
                continue
            parameters = list(function.get_arguments() or []) or [child for child in self.children(function) if child.kind == self.K.PARM_DECL]
            scope = {name: value for name, value in self.globals.items() if self.global_offsets[value[1]] < function.extent.start.offset}
            for param in parameters:
                v = self.variable(param, initialized=True)
                if v:
                    scope[v[0]] = v
            for body in self.children(function):
                if body.kind == self.K.COMPOUND_STMT:
                    if function.spelling == "main":
                        self.insert(body.extent.start.offset + 1, "::runspect_auto::start(); ::runspect_auto::Completion " + self.prefix + "completion;")
                    first_edit = len(self.edits)
                    self.ready_flags = set()
                    if not self.constexpr_function: self.allocations(function)
                    self.call_guard(body,function.spelling,parameters)
                    self.block(body, scope, entry=True)
                    self.hoist_flags(body, first_edit)
        for usr in self.observed:
            capability = self.observed_capability(usr)
            if capability:
                self.available.add(capability)
            if self.reference_type(self.variable_types[usr]): self.available.add("references")
        # Multiple insertions at the same position must preserve discovery order.
        output = bytearray(self.source)
        for _, (start, end, text) in sorted(enumerate(self.edits), key=lambda item: (item[1][0], item[1][1] > item[1][0], item[0]), reverse=True):
            output[start:end] = text
        return bytes(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("--runtime", default="")
    parser.add_argument("--cache", default="")
    parser.add_argument("--analyze-only", action="store_true")
    args = parser.parse_args()
    try:
        ci, resources = load_clang(args.runtime)
    except (ImportError, OSError) as error:
        print("Análise automática indisponível: instale python3-clang. " + str(error), file=sys.stderr)
        return 2
    path = os.path.abspath(args.source)
    source = Path(path).read_bytes()
    options = compiler_options(resources) + ["-I", str(Path(path).parent)]
    try:
        unit = parse_source(ci, path, source, options, args.cache)
    except ci.TranslationUnitLoadError as error:
        print("Falha na análise automática: " + str(error), file=sys.stderr)
        return 1
    errors = [str(d) for d in unit.diagnostics if d.severity >= ci.Diagnostic.Error]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    # Explicit instrumentation is authoritative and keeps its existing trace.
    tool = Instrumenter(ci, unit, source, path)
    for node in tool.children(unit.cursor):
        for sub in tool.descendants(node):
            if sub.kind == ci.CursorKind.CALL_EXPR and sub.referenced:
                parent = sub.referenced.semantic_parent
                if parent and parent.kind == ci.CursorKind.NAMESPACE and parent.spelling == "viz":
                    tool.collect(unit.cursor)
                    tool.reachable_functions()
                    print(json.dumps({"mode": "manual", "capabilities": tool.source_capabilities(manual=True)}))
                    return 0
    output = tool.run()
    # GCC cannot load a PCH from inside another header. Keep this include at
    # translation-unit level, before the instrumentation header and C++ tokens.
    prefix = b'#include <bits/stdc++.h>\n' if stdlib_first(source) else b''
    if not args.analyze_only:
        Path(path).write_bytes(prefix + b'#include "automatic.h"\n#line 1 "solution.cpp"\n' + output)
    print(json.dumps({"mode": "automatic", "warnings": sorted(tool.warnings), "capabilities": tool.source_capabilities()}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
