#ifndef RUNSPECT_AUTOMATIC_H
#define RUNSPECT_AUTOMATIC_H

#include "visualizer.h"
#include <algorithm>
#include <array>
#include <bitset>
#include <cmath>
#include <cerrno>
#include <cstdlib>
#include <cstdio>
#include <deque>
#include <exception>
#include <functional>
#include <cstdint>
#include <iomanip>
#include <iterator>
#include <list>
#include <limits>
#include <map>
#include <optional>
#include <queue>
#include <set>
#include <stack>
#include <tuple>
#include <streambuf>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <unistd.h>

namespace runspect_auto {

// Trace events use FD 3, separate from the user's stdout.
class TraceBuffer : public std::streambuf {
    std::string pending;
    bool write_all(const char* data, std::streamsize count) {
        std::streamsize written = 0;
        while (written < count) {
            auto n = ::write(3, data + written, static_cast<size_t>(count - written));
            if (n < 0 && errno == EINTR) continue;
            if (n <= 0) break;
            written += n;
        }
        return written == count;
    }
    std::streamsize xsputn(const char* data, std::streamsize count) override {
        const auto size = static_cast<size_t>(count);
        pending.append(data, size);
        auto end = std::string_view(data, size).find_last_of('\n');
        if (end != std::string::npos) {
            const auto complete = pending.size() - size + end + 1;
            if (!write_all(pending.data(),static_cast<std::streamsize>(complete))) return 0;
            pending.erase(0,complete);
        }
        return count;
    }
    int sync() override {
        if (!write_all(pending.data(),static_cast<std::streamsize>(pending.size()))) return -1;
        pending.clear();
        return 0;
    }
    int overflow(int ch) override {
        if (ch == traits_type::eof()) return traits_type::not_eof(ch);
        char value = static_cast<char>(ch);
        return xsputn(&value, 1) == 1 ? ch : traits_type::eof();
    }
};

inline void connect() {
    static TraceBuffer buffer;
    static std::ostream stream(&buffer);
    static const bool configured = (stream.imbue(std::locale::classic()),true);
    (void)configured;
    viz::event_stream_pointer() = &stream;
}

constexpr size_t hard_max_items = 2048;
constexpr size_t hard_max_frames = 10000;
inline size_t max_items = 256;
inline size_t max_frames = 2000;
inline size_t frame_count = 0;
inline bool program_started = false;
inline bool limit_emitted = false;
inline bool items_limit_emitted = false;

// Forward cout to its original buffer and retain only the bytes written since
// the last frame. Formatting, flushing, and the program's stdout stay intact.
class OutputBuffer : public std::streambuf {
public:
    std::streambuf* destination = nullptr;
    std::string pending;
    static constexpr size_t max_bytes = 8 << 20;
    void remember(const char* data, size_t count) {
        pending.append(data, std::min(count, max_bytes - pending.size()));
    }
protected:
    std::streamsize xsputn(const char* data, std::streamsize count) override {
        auto written = destination->sputn(data, count);
        if (written > 0) remember(data, static_cast<size_t>(written));
        return written;
    }
    int overflow(int ch) override {
        if (ch == traits_type::eof()) return traits_type::not_eof(ch);
        auto result = destination->sputc(static_cast<char>(ch));
        if (result != traits_type::eof()) {
            char value = static_cast<char>(ch);
            remember(&value, 1);
        }
        return result;
    }
    int sync() override { return destination->pubsync(); }
    pos_type seekoff(off_type offset, std::ios_base::seekdir way, std::ios_base::openmode mode) override {
        return destination->pubseekoff(offset, way, mode);
    }
    pos_type seekpos(pos_type position, std::ios_base::openmode mode) override {
        return destination->pubseekpos(position, mode);
    }
};

inline OutputBuffer& output_buffer() {
    // cout can still be used by atexit/static destructors after Completion.
    // Keep the forwarding buffer alive until the process exits.
    static auto* buffer = new OutputBuffer;
    return *buffer;
}

inline void capture_output() {
    if (!program_started) return;
    auto& buffer = output_buffer();
    if (std::cout.rdbuf() == &buffer) return;
    // sync_with_stdio(false) replaces cout's buffer. Reattach at the next frame.
    auto state = std::cout.rdstate();
    buffer.destination = std::cout.rdbuf(&buffer);
    std::cout.clear(state);
}

inline void flush_output(int line) {
    capture_output();
    auto& buffer = output_buffer();
    if (buffer.pending.empty() || !program_started || frame_count >= max_frames) return;
    connect();
    viz::event_stream() << "{\"step_event\":\"PROGRAM_OUTPUT\",\"text\":\"" << viz::escape_json(buffer.pending) << "\",\"line\":" << line << "}\n";
    buffer.pending.clear();
}

inline bool enabled() {
    if (!program_started) return false;
    connect();
    if (frame_count < max_frames) return true;
    if (!limit_emitted) {
        limit_emitted = true;
        viz::print("Visualização automática limitada a " + std::to_string(max_frames) + " passos; o programa continua executando.", 0);
    }
    return false;
}

inline size_t configured_limit(const char* name, size_t fallback, size_t ceiling) {
    const char* value = std::getenv(name);
    if (!value || !*value) return fallback;
    char* end = nullptr;
    auto parsed = std::strtoul(value, &end, 10);
    return end && !*end && parsed > 0 ? std::min<size_t>(parsed, ceiling) : fallback;
}

inline void start() {
    max_items = configured_limit("RUNSPECT_TRACE_MAX_ITEMS", 256, hard_max_items);
    max_frames = configured_limit("RUNSPECT_TRACE_MAX_STEPS", 2000, hard_max_frames);
    program_started = true; connect(); capture_output();
}

[[noreturn]] inline void fail_execution(const char* event, const std::string& message, int line) {
    flush_output(line);
    connect();
    viz::event_stream() << "{\"step_event\":\"" << event << "\",\"message\":\"" << viz::escape_json(message) << "\",\"line\":" << line << "}\n";
    viz::step(message, line);
    std::cout.flush();
    std::fflush(stdout);
    std::_Exit(65);
}

// A failed standalone read must stop before an uninitialized value is used.
// Reads used as conditions (while/if) intentionally handle failure themselves.
inline void check_input(const std::istream& input, int line) {
    if (!input.fail() || !program_started) return;
    std::string message = input.eof()
        ? "Entrada insuficiente na linha " + std::to_string(line) + ": cin tentou ler depois do fim do stdin. Complete os dados de entrada."
        : "Entrada inválida na linha " + std::to_string(line) + ": cin não conseguiu ler o valor esperado. Confira os dados de entrada.";
    fail_execution("INPUT_ERROR", message, line);
}

inline void items_limit() {
    if (!items_limit_emitted) {
        items_limit_emitted = true;
        viz::print("Estruturas grandes: a visualização mostra até " + std::to_string(max_items) + " elementos por estrutura.", 0);
    }
}

template<class T> struct sequence : std::false_type {};
template<class T, class A> struct sequence<std::vector<T,A>> : std::true_type {};
template<class T, size_t N> struct sequence<std::array<T,N>> : std::true_type {};
template<class T, size_t N> struct sequence<T[N]> : std::true_type {};
template<class T, class A> struct sequence<std::deque<T,A>> : std::true_type {};
template<class T, class A> struct sequence<std::list<T,A>> : std::true_type {};
template<class C, class A, class Alloc> struct sequence<std::set<C,A,Alloc>> : std::true_type {};
template<class C, class A, class Alloc> struct sequence<std::multiset<C,A,Alloc>> : std::true_type {};
template<class C, class H, class E, class A> struct sequence<std::unordered_set<C,H,E,A>> : std::true_type {};
template<class C, class H, class E, class A> struct sequence<std::unordered_multiset<C,H,E,A>> : std::true_type {};
template<class C, class Traits, class A> struct sequence<std::basic_string<C,Traits,A>> : std::true_type {};
template<class T> struct pair : std::false_type {};
template<class A, class B> struct pair<std::pair<A,B>> : std::true_type {};
template<class T> struct tuple : std::false_type {};
template<class... T> struct tuple<std::tuple<T...>> : std::true_type {};
template<class T> struct optional : std::false_type {};
template<class T> struct optional<std::optional<T>> : std::true_type {};
template<class T> struct bits : std::false_type {};
template<size_t N> struct bits<std::bitset<N>> : std::true_type {};
template<class T> struct mapping : std::false_type {};
template<class K, class V, class C, class A> struct mapping<std::map<K,V,C,A>> : std::true_type {};
template<class K, class V, class C, class A> struct mapping<std::multimap<K,V,C,A>> : std::true_type {};
template<class K, class V, class H, class E, class A> struct mapping<std::unordered_map<K,V,H,E,A>> : std::true_type {};
template<class K, class V, class H, class E, class A> struct mapping<std::unordered_multimap<K,V,H,E,A>> : std::true_type {};
template<class T> struct adapter : std::false_type {};
template<class T, class C> struct adapter<std::queue<T,C>> : std::true_type {};
template<class T, class C> struct adapter<std::stack<T,C>> : std::true_type {};
template<class T, class C, class P> struct adapter<std::priority_queue<T,C,P>> : std::true_type {};
template<class T> struct priority : std::false_type {};
template<class T, class C, class P> struct priority<std::priority_queue<T,C,P>> : std::true_type {};
template<class T> struct safe_priority : std::false_type {};
template<class T> struct standard_order : std::bool_constant<std::is_arithmetic_v<T> || std::is_enum_v<T> || std::is_same_v<T,std::string> || std::is_same_v<T,__int128> || std::is_same_v<T,unsigned __int128>> {};
template<class A,class B> struct standard_order<std::pair<A,B>> : std::bool_constant<standard_order<A>::value && standard_order<B>::value> {};
template<class T,class C,class P> struct safe_priority<std::priority_queue<T,C,P>> : std::bool_constant<standard_order<T>::value && (std::is_same_v<P,std::less<T>> || std::is_same_v<P,std::greater<T>>)> {};
template<class T> struct safe_adapter_container : std::false_type {};
template<class T,class C> struct safe_adapter_container<std::queue<T,C>> : std::bool_constant<std::is_same_v<C,std::deque<T>> || std::is_same_v<C,std::list<T>>> {};
template<class T,class C> struct safe_adapter_container<std::stack<T,C>> : std::bool_constant<std::is_same_v<C,std::deque<T>> || std::is_same_v<C,std::list<T>> || std::is_same_v<C,std::vector<T>>> {};
template<class T,class C,class P> struct safe_adapter_container<std::priority_queue<T,C,P>> : std::bool_constant<std::is_same_v<C,std::vector<T>> || std::is_same_v<C,std::deque<T>>> {};
template<class Adapter> struct adapter_storage : Adapter {
    static const typename Adapter::container_type& get(const Adapter& value) {
        // A pointer to the inherited protected member applies to its original
        // base object. No downcast, container copy, or comparator call occurs.
        return value.*&adapter_storage::c;
    }
};
template<class T> using bare = std::remove_cv_t<std::remove_reference_t<T>>;
template<class T> constexpr bool number = std::is_arithmetic_v<bare<T>> || std::is_same_v<bare<T>, __int128> || std::is_same_v<bare<T>, unsigned __int128>;
// Accessors are generated by Clang beside public, named user records. ADL
// finds them without touching private members or invoking user operators.
void runspect_record_fields();
void runspect_record_type();
template<class T, class = void> struct record : std::false_type {};
template<class T> struct record<T, std::void_t<decltype(runspect_record_fields(std::declval<const T&>(), false))>> : std::true_type {};
template<class T> struct safe_item : std::bool_constant<number<T> || std::is_enum_v<T> || std::is_same_v<T,std::string>> {};
template<class A,class B> struct safe_item<std::pair<A,B>> : std::bool_constant<safe_item<bare<A>>::value && safe_item<bare<B>>::value> {};

template<class T> struct structure_kind { static std::string name() { return record<T>::value ? "record" : std::is_pointer_v<T> ? "pointer" : "scalar"; } };
template<class T,class A> struct structure_kind<std::vector<T,A>> { static std::string name() { return pair<bare<T>>::value ? "vector-pair" : "vector"; } };
template<class T,size_t N> struct structure_kind<std::array<T,N>> { static std::string name() { return "array"; } };
template<class T,size_t N> struct structure_kind<T[N]> { static std::string name() { return "array"; } };
template<class T,class A> struct structure_kind<std::deque<T,A>> { static std::string name() { return "deque"; } };
template<class T,class A> struct structure_kind<std::list<T,A>> { static std::string name() { return "list"; } };
template<class T,class C,class A> struct structure_kind<std::set<T,C,A>> { static std::string name() { return "set"; } };
template<class T,class C,class A> struct structure_kind<std::multiset<T,C,A>> { static std::string name() { return "multiset"; } };
template<class T,class H,class E,class A> struct structure_kind<std::unordered_set<T,H,E,A>> { static std::string name() { return "unordered_set"; } };
template<class T,class H,class E,class A> struct structure_kind<std::unordered_multiset<T,H,E,A>> { static std::string name() { return "unordered_multiset"; } };
template<class K,class V,class C,class A> struct structure_kind<std::map<K,V,C,A>> { static std::string name() { return "map"; } };
template<class K,class V,class C,class A> struct structure_kind<std::multimap<K,V,C,A>> { static std::string name() { return "multimap"; } };
template<class K,class V,class H,class E,class A> struct structure_kind<std::unordered_map<K,V,H,E,A>> { static std::string name() { return "unordered_map"; } };
template<class K,class V,class H,class E,class A> struct structure_kind<std::unordered_multimap<K,V,H,E,A>> { static std::string name() { return "unordered_multimap"; } };
template<class T,class C> struct structure_kind<std::queue<T,C>> { static std::string name() { return "queue"; } };
template<class T,class C> struct structure_kind<std::stack<T,C>> { static std::string name() { return "stack"; } };
template<class T,class C,class P> struct structure_kind<std::priority_queue<T,C,P>> { static std::string name() { return "priority_queue"; } };
template<class C,class T,class A> struct structure_kind<std::basic_string<C,T,A>> { static std::string name() { return "string"; } };
template<class A,class B> struct structure_kind<std::pair<A,B>> { static std::string name() { return "pair"; } };
template<class... T> struct structure_kind<std::tuple<T...>> { static std::string name() { return "tuple"; } };
template<class T> struct structure_kind<std::optional<T>> { static std::string name() { return "optional"; } };
template<size_t N> struct structure_kind<std::bitset<N>> { static std::string name() { return "bitset"; } };

inline std::string int128_text(unsigned __int128 value) {
    std::string out;
    do { out.push_back(static_cast<char>('0' + value % 10)); value /= 10; } while (value);
    std::reverse(out.begin(), out.end());
    return out;
}

template<class T> inline std::string text(const T& value, bool initialized = false);

struct ObjectField {
    std::string name, value;
    bool reference = false;
    size_t target = 0;
};
struct ObjectSnapshot {
    size_t id = 0;
    std::string type, status = "observed";
    std::vector<ObjectField> fields;
};
struct ObjectRoot { std::string name; size_t target; };
inline std::map<std::uintptr_t, size_t> object_ids;
inline std::set<size_t> released_objects;
inline size_t next_object_id = 0;
inline std::map<std::uintptr_t, std::function<ObjectSnapshot()>> heap_objects;
inline std::string reference_cache;

template<class T> inline size_t pointer_id(T* value) {
    if (!value) return 0;
    auto address = reinterpret_cast<std::uintptr_t>(value);
    auto found = object_ids.find(address);
    if (found != object_ids.end()) return found->second;
    if (object_ids.size() >= hard_max_items * 4) { items_limit(); return 0; }
    return object_ids[address] = ++next_object_id;
}

template<class T> inline ObjectField object_field(const char* name, const T& value, bool initialized) {
    if (!initialized) return {name, "inicialização não confirmada"};
    if constexpr (std::is_volatile_v<T>) return {name, "valor volatile não expandido"};
    else if constexpr (std::is_pointer_v<T> && !std::is_function_v<std::remove_pointer_t<T>>) {
        auto id = pointer_id(value);
        return {name, value ? (id ? "@" + std::to_string(id) : "referência não capturada") : "nullptr", true, id};
    } else return {name, text(value, initialized)};
}

template<class T> inline ObjectSnapshot object_snapshot(const T* value, bool initialized = false) {
    ObjectSnapshot result;
    result.id = pointer_id(value);
    if constexpr (record<bare<T>>::value) {
        result.type = runspect_record_type(value);
        result.fields = runspect_record_fields(*value, initialized);
    } else {
        result.type = "valor";
        result.fields = {object_field("valor", *value, initialized)};
    }
    return result;
}

// Only allocations whose lifetime is visible to the AST are registered.
// Unknown pointers are displayed as references and are never dereferenced.
template<class T> inline T* allocated(T* value, bool initialized) {
    if (!value || !program_started || !enabled()) return value;
    if constexpr (record<bare<T>>::value || number<T> || std::is_enum_v<T>) {
        if (heap_objects.size() >= max_items) { items_limit(); return value; }
        auto address = reinterpret_cast<std::uintptr_t>(value);
        object_ids[address] = ++next_object_id;
        heap_objects[address] = [value, initialized] { return object_snapshot(value, initialized); };
    }
    return value;
}

template<class T> inline T* before_delete(T* value) {
    if (value) {
        auto address = reinterpret_cast<std::uintptr_t>(value);
        heap_objects.erase(address);
        auto found = object_ids.find(address);
        if (found != object_ids.end()) released_objects.insert(found->second);
    }
    return value;
}

inline void show_references(std::vector<ObjectSnapshot> observed, const std::vector<ObjectRoot>& roots, int line) {
    std::map<size_t, ObjectSnapshot> objects;
    for (const auto& entry : heap_objects) {
        if (objects.size() >= max_items) { items_limit(); break; }
        auto snapshot = entry.second();
        objects.emplace(snapshot.id, std::move(snapshot));
    }
    for (auto& snapshot : observed) {
        if (objects.size() >= max_items && !objects.count(snapshot.id)) { items_limit(); break; }
        objects[snapshot.id] = std::move(snapshot);
    }
    std::set<size_t> targets;
    for (const auto& root : roots) if (root.target) targets.insert(root.target);
    for (const auto& entry : objects) for (const auto& field : entry.second.fields) if (field.reference && field.target) targets.insert(field.target);
    for (auto id : targets) if (!objects.count(id) && objects.size() < max_items) {
        objects.emplace(id, ObjectSnapshot{id, "objeto", released_objects.count(id) ? "released" : "unobserved", {}});
    }
    std::string json = ",\"roots\":[";
    for (size_t i = 0; i < std::min(roots.size(), max_items); ++i) {
        if (i) json += ',';
        json += "{\"name\":\"" + viz::escape_json(roots[i].name) + "\",\"target\":" + (roots[i].target ? std::to_string(roots[i].target) : "null") + "}";
    }
    json += "],\"objects\":[";
    bool first = true;
    for (const auto& entry : objects) {
        const auto& object = entry.second;
        if (!first) json += ',';
        first = false;
        json += "{\"id\":" + std::to_string(object.id) + ",\"type\":\"" + viz::escape_json(object.type) + "\",\"status\":\"" + object.status + "\",\"fields\":[";
        for (size_t i = 0; i < object.fields.size(); ++i) {
            if (i) json += ',';
            const auto& field = object.fields[i];
            json += "{\"name\":\"" + viz::escape_json(field.name) + "\",\"value\":\"" + viz::escape_json(field.value) + "\"";
            if (field.reference) json += ",\"target\":" + (field.target ? std::to_string(field.target) : "null");
            json += '}';
        }
        json += "]}";
    }
    json += ']';
    if (reference_cache == json || (reference_cache.empty() && objects.empty() && roots.empty())) return;
    reference_cache = json;
    viz::emit_named("SET_REFERENCES", "Objetos e ponteiros", json, line);
}

template<class Member,class T> inline std::string pair_item(const T& value) {
    if constexpr (std::is_reference_v<Member>) return "referência não expandida";
    else return text(value);
}

template<size_t I, class T> inline std::string tuple_item(const T& value) {
    if constexpr (std::is_reference_v<std::tuple_element_t<I, bare<T>>>) {
        // A tuple can bind a scalar before it is initialized. Do not read it.
        return std::to_string(I) + " = referência não expandida";
    } else {
        return std::to_string(I) + " = " + text(std::get<I>(value));
    }
}

template<class T, size_t... I> inline std::vector<std::string> tuple_items(const T& value, std::index_sequence<I...>) {
    std::vector<std::string> items;
    ((I < max_items ? (items.push_back(tuple_item<I>(value)), 0) : 0), ...);
    return items;
}

template<class T> inline std::string text(const T& value, bool initialized) {
    if constexpr (std::is_volatile_v<T>) {
        return "valor volatile não expandido";
    } else if constexpr (std::is_same_v<bare<T>, __int128>) {
        // Unsigned subtraction also handles the minimum signed 128-bit value.
        auto magnitude = static_cast<unsigned __int128>(value);
        if (value < 0) magnitude = 0 - magnitude;
        return (value < 0 ? "-" : "") + int128_text(magnitude);
    } else if constexpr (std::is_same_v<bare<T>, unsigned __int128>) {
        return int128_text(value);
    } else if constexpr (std::is_arithmetic_v<T> || std::is_enum_v<T>) {
        std::ostringstream out;
        out.imbue(std::locale::classic());
        if constexpr (std::is_enum_v<T>) out << static_cast<std::underlying_type_t<T>>(value);
        else if constexpr (std::is_same_v<T,char> || std::is_same_v<T,unsigned char> || std::is_same_v<T,signed char>) out << static_cast<int>(value);
        else out << std::setprecision(17) << value;
        return out.str();
    } else if constexpr (std::is_same_v<bare<T>, std::string>) {
        return value.substr(0, max_items);
    } else if constexpr (pair<T>::value) {
        return "(" + pair_item<typename bare<T>::first_type>(value.first) + ", " + pair_item<typename bare<T>::second_type>(value.second) + ")";
    } else if constexpr (tuple<bare<T>>::value) {
        constexpr size_t count = std::tuple_size_v<bare<T>>;
        if (count > max_items) items_limit();
        auto items = tuple_items(value, std::make_index_sequence<std::min(count, hard_max_items)>{});
        std::string result = "(";
        for (size_t i = 0; i < items.size(); ++i) {
            if (i) result += ", ";
            result += items[i];
        }
        return result + ")";
    } else if constexpr (optional<bare<T>>::value) {
        return value.has_value() ? "valor = " + text(*value) : "sem valor";
    } else if constexpr (bits<bare<T>>::value) {
        if (value.size() > max_items) items_limit();
        std::string result;
        // Match vector indices: index zero is the least significant bit.
        for (size_t i = 0; i < std::min(value.size(), max_items); ++i) result += value[i] ? '1' : '0';
        return result;
    } else if constexpr (std::is_pointer_v<T> && !std::is_function_v<std::remove_pointer_t<T>>) {
        auto id = pointer_id(value);
        return value ? (id ? "@" + std::to_string(id) : "referência não capturada") : "nullptr";
    } else if constexpr (record<bare<T>>::value) {
        auto fields = runspect_record_fields(value, initialized);
        std::string result = "{";
        for (size_t i = 0; i < fields.size(); ++i) result += (i ? ", " : "") + fields[i].name + " = " + fields[i].value;
        return result + "}";
    } else if constexpr (sequence<bare<T>>::value || mapping<bare<T>>::value) {
        std::string result = "[";
        size_t index = 0;
        for (const auto& item : value) {
            if (index == max_items) { items_limit(); break; }
            result += (index++ ? ", " : "") + text(item, initialized);
        }
        return result + "]";
    } else {
        return "tipo não expandido";
    }
}

inline std::map<std::string,std::vector<long double>> vectors;
inline std::map<std::string,std::vector<std::string>> vector_labels;
inline std::map<std::string,std::vector<long double>> completed_vectors;
inline std::map<std::string,std::vector<std::string>> completed_vector_labels;
inline std::set<std::string> completed_sorting_vectors;
inline std::map<std::string,std::set<int>> completed_found_indices;
inline std::set<std::string> completed_truncated_vectors;
inline std::map<std::string,std::string> completed_metadata;
inline std::map<std::string,std::vector<std::string>> completed_structures;
inline std::map<std::string,std::string> completed_structure_kinds;
inline std::map<std::string,size_t> completed_structure_sizes;
inline std::map<std::string,bool> completed_structure_opaque;
inline std::map<std::string,std::vector<std::vector<std::string>>> completed_matrices;
inline std::map<std::string,size_t> completed_matrix_sizes;
inline std::map<std::string,std::pair<size_t,size_t>> completed_matrix_shapes;
inline std::map<std::string,std::set<int>> found_indices;
inline std::set<std::string> sorting_vectors;
inline std::set<std::string> truncated_vectors;
inline std::set<long double> infinity_values;
inline std::map<std::string,std::string> structure_cache;
inline std::map<std::string,std::string> metadata_cache;
inline std::map<std::string,std::vector<std::string>> structure_items;
inline std::map<std::string,std::string> structure_kinds;
inline std::map<std::string,size_t> structure_sizes;
inline std::map<std::string,bool> structure_opaque;
inline std::vector<std::string> last_scalars;
inline std::map<std::string,std::vector<std::vector<std::string>>> matrix_cache;
inline int read_line = -1;
struct Access { std::string name; int index; std::string value; };
inline std::vector<Access> accesses;
struct MatrixAccess { std::string name; size_t row; size_t col; };
inline std::vector<MatrixAccess> matrix_reads;

template<class C,class R> class MatrixRow {
    const char* name;
    C& container;
    R row;
    int line;
public:
    MatrixRow(const char* name, C& container, R row, int line) : name(name),container(container),row(row),line(line) {
        if (program_started && (row < 0 || static_cast<size_t>(row) >= std::size(container)))
            fail_execution("RUNTIME_ERROR","Índice de linha fora dos limites na linha " + std::to_string(line) + ": " + name + "[" + std::to_string(row) + "].",line);
    }
    template<class I> decltype(auto) at(I col, bool write = false) {
        if (program_started && (col < 0 || static_cast<size_t>(col) >= std::size(container[row])))
            fail_execution("RUNTIME_ERROR","Índice de coluna fora dos limites na linha " + std::to_string(line) + ": " + name + "[" + std::to_string(row) + "][" + std::to_string(col) + "].",line);
        if (enabled()) {
            std::string fields = ",\"row\":" + std::to_string(row) + ",\"col\":" + std::to_string(col)
                + ",\"access\":\"" + (write ? "write" : "read") + "\",\"dependencies\":[";
            if (write) {
                for (size_t i=0;i<matrix_reads.size();++i) {
                    if (i) fields += ',';
                    const auto& dep = matrix_reads[i];
                    fields += "{\"name\":\"" + viz::escape_json(dep.name) + "\",\"row\":" + std::to_string(dep.row) + ",\"col\":" + std::to_string(dep.col) + "}";
                }
            } else if (matrix_reads.size() < max_items) {
                matrix_reads.push_back({name,static_cast<size_t>(row),static_cast<size_t>(col)});
            }
            viz::emit_named("MATRIX_ACCESS",name,fields + "]",line);
        }
        return container[row][col];
    }
};

template<class C,class R> auto matrix_row(const char* name, C& container, R row, int line) {
    return MatrixRow<C,R>(name,container,row,line);
}

inline bool distance_name(const std::string& name) {
    return name == "dist" || name == "distance" || name == "distancia";
}

template<class T> inline std::string distance_label(const std::string& name, const T& value) {
    if constexpr (std::is_arithmetic_v<T>) {
        long double number = static_cast<long double>(value);
        if (distance_name(name) && (number < 0 || number == static_cast<long double>(std::numeric_limits<T>::max()) || infinity_values.count(number))) return "∞";
    }
    return "";
}

inline std::string label_json(const std::string& label) {
    return label.empty() ? "null" : "\"" + viz::escape_json(label) + "\"";
}

inline std::string metadata(const std::string& kind, size_t size, size_t shown, bool initialized = true) {
    return ",\"kind\":\"" + viz::escape_json(kind) + "\",\"size\":" + std::to_string(size)
        + ",\"initialized\":" + (initialized ? "true" : "false")
        + ",\"truncated\":" + std::to_string(size > shown ? size - shown : 0);
}

inline void vector_metadata(const std::string& name, const std::string& kind, size_t size, bool initialized = true, int line = 0) {
    auto fields = metadata(kind, size, std::min(size,max_items), initialized);
    if (metadata_cache[name] == fields) return;
    metadata_cache[name] = fields;
    viz::emit_named("VECTOR_META", name, fields, line);
}

template<class T> inline std::string exact_label(const std::string& name, const T& value) {
    auto label = distance_label(name,value);
    if (!label.empty()) return label;
    if constexpr (number<T>) {
        auto magnitude = static_cast<long double>(value);
        if (magnitude > 9007199254740991.0L || magnitude < -9007199254740991.0L) return text(value);
    }
    return "";
}

inline std::string labels_json(const std::vector<std::string>& labels) {
    std::string json = ",\"value_labels\":[";
    for (size_t i = 0; i < labels.size(); ++i) {
        if (i) json += ',';
        json += label_json(labels[i]);
    }
    return json + ']';
}

inline std::string values_json(const std::vector<long double>& values) {
    std::ostringstream json;
    json.imbue(std::locale::classic());
    json << ",\"values\":[";
    for (size_t i = 0; i < values.size(); ++i) {
        if (i) json << ',';
        json << std::setprecision(17) << static_cast<double>(values[i]);
    }
    json << ']';
    return json.str();
}

inline void reset_vector(const std::string& name, int line) {
    viz::vector_reset(name, line);
    for (int index : found_indices[name]) viz::vector_mark(name, index, viz::VectorState::Found, line);
}

inline void vector_snapshot(const std::string& name, const std::vector<long double>& current, int line, const std::vector<std::string>& labels = {}) {
    auto previous = vectors.find(name);
    const bool labeled = labels.size() == current.size();
    auto label_fields = labeled ? labels_json(labels) : "";
    if (previous == vectors.end() || previous->second.size() != current.size()) {
        found_indices.erase(name);
        viz::emit_named("VECTOR_INIT", name, values_json(current) + label_fields, line);
    } else if (previous->second != current || (labeled && vector_labels[name] != labels)) {
        std::vector<size_t> changed;
        for (size_t i = 0; i < current.size(); ++i)
            if (current[i] != previous->second[i] || (labeled && (i >= vector_labels[name].size() || vector_labels[name][i] != labels[i]))) changed.push_back(i);
        for (auto i : changed) found_indices[name].erase(static_cast<int>(i));
        reset_vector(name, line);
        if (changed.size() == 2 && current[changed[0]] == previous->second[changed[1]] && current[changed[1]] == previous->second[changed[0]]) {
            viz::vector_swap(name, static_cast<int>(changed[0]), static_cast<int>(changed[1]), "Troca de elementos", line);
        } else {
            for (auto i : changed) {
                std::ostringstream fields;
                fields.imbue(std::locale::classic());
                fields << ",\"index\":" << i << ",\"value\":" << std::setprecision(17) << static_cast<double>(current[i]);
                if (labeled) fields << ",\"value_label\":" << label_json(labels[i]);
                viz::emit_named("VECTOR_SET", name, fields.str(), line);
            }
        }
    }
    if (labeled && (!vector_labels.count(name) || vector_labels[name] != labels)) {
        viz::emit_named("VECTOR_LABELS", name, label_fields, line);
        vector_labels[name] = labels;
    }
    vectors[name] = current;
}

inline void show_structure(const std::string& name, const std::vector<std::string>& items, int line, const std::string& kind = "structure", size_t size = std::numeric_limits<size_t>::max(), bool opaque = false) {
    if (size == std::numeric_limits<size_t>::max()) size = items.size();
    auto fields_meta = metadata(kind,size,opaque ? (size ? 1 : 0) : items.size()) + (opaque ? ",\"opaque\":true" : "");
    std::string key = fields_meta;
    for (const auto& item : items) key += std::to_string(item.size()) + ":" + item;
    auto previous = structure_cache.find(name);
    if (previous == structure_cache.end() || previous->second != key) {
        std::string fields = ",\"items\":[";
        for (size_t i=0;i<items.size();++i) {
            if (i) fields += ',';
            fields += "\"" + viz::escape_json(items[i]) + "\"";
        }
        viz::emit_named("SET_STRUCT", name, fields + "]" + fields_meta,line);
        structure_cache[name] = key;
        structure_items[name] = items;
        structure_kinds[name] = kind;
        structure_sizes[name] = size;
        structure_opaque[name] = opaque;
    }
}

inline std::map<std::string,size_t> matrix_sizes;
inline std::map<std::string,std::pair<size_t,size_t>> matrix_shapes;
inline void show_matrix(const std::string& name, const std::vector<std::vector<std::string>>& rows, int line, size_t size, size_t row_count, size_t col_count) {
    size_t shown = 0;
    std::string fields = ",\"rows\":[";
    for (size_t r=0;r<rows.size();++r) {
        if (r) fields += ',';
        fields += '[';
        for (size_t c=0;c<rows[r].size();++c) {
            if (c) fields += ',';
            fields += "\"" + viz::escape_json(rows[r][c]) + "\"";
            ++shown;
        }
        fields += ']';
    }
    auto kind = name == "dp" || name.rfind("dp_",0) == 0 ? "dp" : "matrix";
    viz::emit_named("SET_MATRIX",name,fields + "]" + metadata(kind,size,shown)
        + ",\"shape\":{\"rows\":" + std::to_string(row_count) + ",\"cols\":" + std::to_string(col_count) + "}",line);
    matrix_cache[name] = rows;
    matrix_sizes[name] = size;
    matrix_shapes[name] = {row_count,col_count};
}

class Call;
inline std::vector<Call*> call_stack;
inline size_t next_call_id = 0;
inline size_t total_calls = 0;
inline size_t maximum_depth = 0;
inline std::map<int,size_t> line_operations;

// A call owns only its arguments and local variable names. Globals are never
// restored, so changes made by a callee remain visible to its caller.
class Call {
    struct Saved {
        std::optional<std::vector<long double>> vector;
        std::vector<std::string> labels;
        std::string meta;
        std::optional<std::vector<std::string>> items;
        std::string kind;
        size_t size = 0;
        bool opaque = false;
        std::optional<std::vector<std::vector<std::string>>> matrix;
        size_t matrix_size = 0;
        std::pair<size_t,size_t> shape;
        bool sorting = false;
        bool truncated = false;
        std::set<int> found;
    };
    std::map<std::string,Saved> saved;
    std::vector<std::string> caller_scalars;
    std::string function;
    int line;
    size_t parent;
    bool active;
    int exceptions;
public:
    size_t id;
    size_t depth;
    Call(const char* name, int line) : caller_scalars(last_scalars), function(name), line(line),
        parent(call_stack.empty() ? 0 : call_stack.back()->id), active(enabled()),
        exceptions(std::uncaught_exceptions()), id(++next_call_id), depth(call_stack.size()+1) {
        call_stack.push_back(this);
        ++total_calls;
        maximum_depth = std::max(maximum_depth,depth);
        if (active) emit("CALL_ENTER");
    }
    void emit(const char* event) const {
        viz::event_stream() << "{\"step_event\":\"" << event << "\",\"id\":" << id
            << ",\"parent\":" << (parent ? std::to_string(parent) : "null")
            << ",\"function\":\"" << viz::escape_json(function) << "\",\"depth\":" << depth
            << ",\"line\":" << line;
        if (std::string(event) == "CALL_EXIT") viz::event_stream() << ",\"status\":\"" << (std::uncaught_exceptions() > exceptions ? "threw" : "returned") << "\"";
        viz::event_stream() << "}\n";
    }
    void at(int current_line) { line = current_line; }
    void local(const char* name) {
        if (!active || saved.count(name)) return;
        Saved old;
        if (vectors.count(name)) old.vector = vectors[name];
        old.sorting = sorting_vectors.count(name);
        old.truncated = truncated_vectors.count(name);
        old.found = found_indices[name];
        if (vector_labels.count(name)) old.labels = vector_labels[name];
        if (metadata_cache.count(name)) old.meta = metadata_cache[name];
        if (structure_items.count(name)) {
            old.items = structure_items[name]; old.kind = structure_kinds[name]; old.size = structure_sizes[name];
            old.opaque = structure_opaque[name];
        }
        if (matrix_cache.count(name)) {
            old.matrix = matrix_cache[name]; old.matrix_size = matrix_sizes[name]; old.shape = matrix_shapes[name];
        }
        saved.emplace(name,std::move(old));
        // The new binding starts its own snapshot history. Without clearing
        // this cache a shadowed vector would emit SET against a caller's INIT.
        vectors.erase(name); vector_labels.erase(name); metadata_cache.erase(name);
        structure_cache.erase(name); structure_items.erase(name); structure_kinds.erase(name); structure_sizes.erase(name); structure_opaque.erase(name);
        matrix_cache.erase(name); matrix_sizes.erase(name); matrix_shapes.erase(name);
        found_indices.erase(name); truncated_vectors.erase(name); sorting_vectors.erase(name);
    }
    ~Call() {
        if (!call_stack.empty()) call_stack.pop_back();
        if (!active || !enabled()) return;
        for (const auto& entry : saved) {
            if (!parent) break; // Completion still shows main's final values.
            const auto& name = entry.first; const auto& old = entry.second;
            if (!old.vector && vectors.count(name)) {
                completed_vectors[name] = vectors[name];
                completed_vector_labels[name] = vector_labels[name];
                completed_found_indices[name] = found_indices[name];
                completed_metadata[name] = metadata_cache[name];
                if (sorting_vectors.count(name) && !truncated_vectors.count(name)) completed_sorting_vectors.insert(name);
                if (truncated_vectors.count(name)) completed_truncated_vectors.insert(name);
            }
            if (!old.items && structure_items.count(name)) {
                completed_structures[name] = structure_items[name];
                completed_structure_kinds[name] = structure_kinds[name];
                completed_structure_sizes[name] = structure_sizes[name];
                completed_structure_opaque[name] = structure_opaque[name];
            }
            if (!old.matrix && matrix_cache.count(name)) {
                completed_matrices[name] = matrix_cache[name];
                completed_matrix_sizes[name] = matrix_sizes[name];
                completed_matrix_shapes[name] = matrix_shapes[name];
            }
            vectors.erase(name); vector_labels.erase(name); metadata_cache.erase(name);
            structure_cache.erase(name); structure_items.erase(name); structure_kinds.erase(name); structure_sizes.erase(name); structure_opaque.erase(name);
            matrix_cache.erase(name); matrix_sizes.erase(name); matrix_shapes.erase(name);
            found_indices.erase(name); truncated_vectors.erase(name); sorting_vectors.erase(name);
            if (old.vector) {
                vector_snapshot(name,*old.vector,line,old.labels);
                if (old.sorting) sorting_vectors.insert(name);
                if (old.truncated) truncated_vectors.insert(name);
                found_indices[name] = old.found;
                for (int index : old.found) viz::vector_mark(name,index,viz::VectorState::Found,line);
                if (!old.meta.empty()) { metadata_cache[name] = old.meta; viz::emit_named("VECTOR_META",name,old.meta,line); }
            }
            if (old.items) show_structure(name,*old.items,line,old.kind,old.size,old.opaque);
            if (old.matrix) show_matrix(name,*old.matrix,line,old.matrix_size,old.shape.first,old.shape.second);
            if (!old.vector && !old.items && !old.matrix) viz::emit_named("VARIABLE_END",name,"",line);
        }
        if (parent && !caller_scalars.empty()) {
            // Keep observed global writes while restoring shadowed parameters
            // and locals from the caller. No program expression is evaluated.
            for (auto& item : caller_scalars) {
                auto separator = item.find(" = ");
                if (separator == std::string::npos || saved.count(item.substr(0,separator))) continue;
                auto prefix = item.substr(0,separator+3);
                for (const auto& latest : last_scalars) if (latest.rfind(prefix,0)==0) { item = latest; break; }
            }
            show_structure("Variáveis",caller_scalars,line,"scalars");
        }
        emit("CALL_EXIT");
        viz::step((std::uncaught_exceptions() > exceptions ? "Exceção em " : "Retorno de ") + function,line);
        ++frame_count;
    }
};

inline void local(const char* name) { if (!call_stack.empty()) call_stack.back()->local(name); }

constexpr bool constant_evaluation() { return __builtin_is_constant_evaluated(); }
inline Call* constexpr_call(const char* name, int line) { return new Call(name, line); }
template<class T> constexpr T constexpr_result(T value, Call* call) {
    if (!constant_evaluation()) delete call;
    return value;
}

using Edges = std::map<std::pair<int,int>,int>;
inline std::string active_graph;
inline std::set<int> graph_nodes;
inline Edges graph_edges;
inline bool graph_directed = true;
inline bool graph_started = false;
inline bool graph_weighted = false;
inline std::set<int> processed_nodes;
inline std::set<int> reached_nodes;
inline std::map<int,int> graph_parents;
inline std::map<std::string,std::vector<int>> graph_paths;
inline std::map<int,std::string> graph_values;

inline bool has_edge(int u, int v) {
    if (!graph_directed && u > v) std::swap(u, v);
    return graph_edges.count({u, v}) != 0;
}

inline bool valid_path(const std::vector<int>& path) {
    if (path.empty()) return false;
    for (size_t i = 0; i < path.size(); ++i) {
        if (!graph_nodes.count(path[i])) return false;
        if (i && !has_edge(path[i - 1], path[i])) return false;
    }
    return true;
}

inline void graph_snapshot(const std::string& name, std::set<int> nodes, Edges edges, int line) {
    if (!active_graph.empty() && active_graph != name) return;
    active_graph = name;
    bool directed = false;
    bool weighted = false;
    for (const auto& entry : edges) {
        auto reverse = edges.find({entry.first.second, entry.first.first});
        if (reverse == edges.end() || reverse->second != entry.second) directed = true;
        if (entry.second != 1) weighted = true;
    }
    if (edges.empty()) directed = graph_directed;
    if (!directed) {
        Edges unique;
        for (const auto& entry : edges)
            unique[{std::min(entry.first.first,entry.first.second), std::max(entry.first.first,entry.first.second)}] = entry.second;
        edges = std::move(unique);
    }
    if (graph_started && graph_directed != directed) {
        for (auto node : graph_nodes) viz::remove_node(node, line);
        graph_nodes.clear();
        graph_edges.clear();
        processed_nodes.clear();
        reached_nodes.clear();
        graph_parents.clear();
        graph_paths.clear();
        graph_values.clear();
    }
    if (!graph_started || graph_directed != directed) viz::set_directed(directed, line);
    if (!graph_started || graph_weighted != weighted) viz::set_weighted(weighted, line);
    for (auto node : graph_nodes) if (!nodes.count(node)) viz::remove_node(node, line);
    for (auto node : nodes) if (!graph_nodes.count(node)) viz::add_node(node, std::to_string(node), line);
    for (const auto& entry : graph_edges) if (!edges.count(entry.first)) viz::remove_edge(entry.first.first,entry.first.second,line);
    for (const auto& entry : edges) {
        auto old = graph_edges.find(entry.first);
        if (old == graph_edges.end()) viz::add_edge(entry.first.first,entry.first.second,entry.second,line);
        else if (old->second != entry.second) viz::set_weight(entry.first.first,entry.first.second,entry.second,line);
    }
    graph_nodes = std::move(nodes);
    graph_edges = std::move(edges);
    graph_directed = directed;
    graph_started = true;
    graph_weighted = weighted;
}

class Frame {
    std::vector<std::string> scalars;
    std::vector<std::string> names;
    std::string caption;
    int line;
    bool active;
    std::vector<ObjectSnapshot> objects;
    std::vector<ObjectRoot> roots;
public:
    Frame(const char* caption, int line) : caption(caption), line(line), active(enabled()) {
        flush_output(line);
        if (!call_stack.empty()) call_stack.back()->at(line);
    }
    ~Frame() {
        if (!active) return;
        if (!scalars.empty()) last_scalars = scalars;
        show_structure("Variáveis", scalars, line,"scalars");
        show_references(std::move(objects), roots, line);
        std::string scope = ",\"names\":[";
        for (size_t i=0;i<names.size();++i) { if(i) scope += ','; scope += "\"" + viz::escape_json(names[i]) + "\""; }
        viz::emit_named("FRAME_SCOPE","",scope + "]",line);
        show_structure("Execução", {"linha " + std::to_string(line)}, line);
        viz::step(caption, line);
        ++frame_count;
        read_line = -1;
        accesses.clear();
        matrix_reads.clear();
    }
    void uninitialized(const std::string& name) {
        if (!active) return;
        names.push_back(name);
        if (metadata_cache[name] == "uninitialized") return;
        metadata_cache[name] = "uninitialized";
        viz::emit_named("UNINITIALIZED",name,",\"kind\":\"scalar\",\"initialized\":false",line);
    }
    template<class T> void observe(const std::string& name, const T& value, bool sorting = false, bool initialized = false) {
        if (!active) return;
        names.push_back(name);
        if (metadata_cache[name] == "uninitialized") {
            metadata_cache.erase(name);
            viz::emit_named("UNINITIALIZED",name,",\"kind\":\"scalar\",\"initialized\":true",line);
        }
        const auto kind = structure_kind<bare<T>>::name();
        if constexpr (number<T> || std::is_enum_v<T>) {
            scalars.push_back(name + " = " + text(value));
            if constexpr (number<T>) {
                if (name == "INF" || name == "inf" || name == "infinity") infinity_values.insert(static_cast<long double>(value));
            }
        } else if constexpr (sequence<bare<T>>::value) {
            using Item = bare<decltype(*std::begin(value))>;
            if constexpr (number<Item>) {
                vector_metadata(name,kind,std::size(value),true,line);
                if (std::size(value) > max_items) truncated_vectors.insert(name);
                else truncated_vectors.erase(name);
                std::vector<long double> current;
                std::vector<std::string> labels;
                for (auto item : value) {
                    if (current.size() == max_items) { items_limit(); break; }
                    long double n = static_cast<long double>(item);
                    if (!std::isfinite(n)) return;
                    current.push_back(n);
                    labels.push_back(exact_label(name, static_cast<Item>(item)));
                }
                vector_snapshot(name, current, line, labels);
                if (sorting) sorting_vectors.insert(name);
                if (graph_started) {
                    if (name == "path" || name == "caminho" || name == "shortest_path") {
                        graph_paths.erase(name);
                        if (truncated_vectors.count(name)) return;
                        std::vector<int> path;
                        for (auto item : current) {
                            if (item < std::numeric_limits<int>::min() || item > std::numeric_limits<int>::max() || std::floor(item) != item) return;
                            path.push_back(static_cast<int>(item));
                        }
                        graph_paths[name] = std::move(path);
                    } else if (name == "dist" || name == "distance" || name == "distancia" || name == "vis" || name == "visited" || name == "visitado" || name == "seen") {
                        const bool distance = name == "dist" || name == "distance" || name == "distancia";
                        for (int id : graph_nodes) {
                            if (id < 0 || static_cast<size_t>(id) >= current.size()) continue;
                            auto item = current[id];
                            bool reached = distance ? item >= 0 && item < static_cast<long double>(std::numeric_limits<Item>::max()) && !infinity_values.count(item) : item != 0;
                            if (reached && reached_nodes.insert(id).second) viz::graph_node_state(id, viz::NodeState::Queued, line);
                            if (distance) {
                                auto badge = reached ? "d=" + text(item) : "∞";
                                if (graph_values[id] != badge) {
                                    viz::graph_value(id, badge, line);
                                    graph_values[id] = badge;
                                }
                            }
                        }
                    } else if (name == "pai" || name == "parent" || name == "predecessor" || name == "prev") {
                        for (int id : graph_nodes) {
                            if (id < 0 || static_cast<size_t>(id) >= current.size()) continue;
                            auto parent = current[id];
                            if (parent < std::numeric_limits<int>::min() || parent > std::numeric_limits<int>::max() || std::floor(parent) != parent) continue;
                            if (has_edge(static_cast<int>(parent), id)) graph_parents[id] = static_cast<int>(parent);
                            else graph_parents.erase(id);
                        }
                    }
                }
            } else if constexpr (sequence<Item>::value) {
                using Cell = bare<decltype(*std::begin(*std::begin(value)))>;
                if constexpr (number<Cell> || std::is_same_v<Cell,std::string> || record<Cell>::value || std::is_pointer_v<Cell>) {
                    std::vector<std::vector<std::string>> rows;
                    size_t count = 0;
                    for (const auto& row : value) {
                        if (count >= max_items) { items_limit(); break; }
                        std::vector<std::string> cells;
                        for (const auto& cell : row) {
                            if (count++ >= max_items) { items_limit(); break; }
                            cells.push_back(text(cell));
                        }
                        rows.push_back(std::move(cells));
                    }
                    size_t total = 0, cols = 0;
                    for (const auto& row : value) { total += std::size(row); cols = std::max(cols,std::size(row)); }
                    auto old = matrix_cache.find(name);
                    if (old == matrix_cache.end() || old->second != rows || matrix_sizes[name] != total) {
                        show_matrix(name, rows, line, total, std::size(value), cols);
                    }
                }
            } else if constexpr (pair<Item>::value || tuple<Item>::value || optional<Item>::value || bits<Item>::value || std::is_same_v<Item,std::string> || record<Item>::value || std::is_pointer_v<Item>) {
                std::vector<std::string> items;
                for (const auto& item : value) {
                    if (items.size() == max_items) { items_limit(); break; }
                    if constexpr (record<Item>::value) {
                        auto snapshot = object_snapshot(&item);
                        roots.push_back({name + "[" + std::to_string(items.size()) + "]", snapshot.id});
                        objects.push_back(std::move(snapshot));
                    } else if constexpr (std::is_pointer_v<Item> && !std::is_function_v<std::remove_pointer_t<Item>>) {
                        roots.push_back({name + "[" + std::to_string(items.size()) + "]", pointer_id(item)});
                    }
                    items.push_back(text(item));
                }
                if (kind.rfind("unordered_",0) == 0) std::sort(items.begin(),items.end());
                show_structure(name,items,line,kind,std::size(value));
            }
        } else if constexpr (bits<bare<T>>::value) {
            vector_metadata(name,kind,value.size(),true,line);
            std::vector<long double> current;
            if (value.size() > max_items) items_limit();
            for (size_t i = 0; i < std::min(value.size(), max_items); ++i) current.push_back(value[i] ? 1 : 0);
            vector_snapshot(name, current, line);
        } else if constexpr (tuple<bare<T>>::value) {
            constexpr size_t count = std::tuple_size_v<bare<T>>;
            if (count > max_items) items_limit();
            show_structure(name, tuple_items(value, std::make_index_sequence<std::min(count, hard_max_items)>{}), line,kind,count);
        } else if constexpr (optional<bare<T>>::value) {
            show_structure(name, {text(value)}, line,kind);
        } else if constexpr (mapping<bare<T>>::value) {
            std::vector<std::string> items;
            for (const auto& item : value) {
                if (items.size() == max_items) { items_limit(); break; }
                items.push_back(text(item.first) + " → " + text(item.second));
            }
            if (kind.rfind("unordered_",0) == 0) std::sort(items.begin(),items.end());
            show_structure(name,items,line,kind,value.size());
        } else if constexpr (adapter<bare<T>>::value) {
            if constexpr (safe_item<typename T::value_type>::value || record<typename T::value_type>::value || pair<typename T::value_type>::value) {
                // Popping a copied heap would invoke a user-defined comparator.
                if constexpr (safe_adapter_container<T>::value && ((priority<T>::value && !safe_priority<T>::value) || !safe_item<typename T::value_type>::value)) {
                    std::vector<std::string> items;
                    const auto& storage = adapter_storage<T>::get(value);
                    if constexpr (std::is_same_v<T,std::stack<typename T::value_type,typename T::container_type>>) {
                        for (auto it=storage.rbegin(); it!=storage.rend(); ++it) {
                            if (items.size() == max_items) { items_limit(); break; }
                            items.push_back(text(*it));
                        }
                    } else {
                        for (const auto& item : storage) {
                            if (items.size() == max_items) { items_limit(); break; }
                            items.push_back(text(item));
                        }
                    }
                    show_structure(name,items,line,priority<T>::value ? "priority_heap" : kind,value.size());
                    return;
                } else if constexpr (!safe_adapter_container<T>::value) {
                    std::vector<std::string> items;
                    if (!value.empty()) {
                        if constexpr (std::is_same_v<T,std::queue<typename T::value_type,typename T::container_type>>) items.push_back("frente = " + text(value.front()));
                        else items.push_back("topo = " + text(value.top()));
                    }
                    items.push_back("tamanho = " + std::to_string(value.size()));
                    show_structure(name,items,line,kind,value.size(),true);
                    return;
                } else {
                    if (value.size() > max_items) items_limit();
                    auto copy = value;
                    std::vector<std::string> items;
                    while (!copy.empty() && items.size() < max_items) {
                        if constexpr (std::is_same_v<T,std::queue<typename T::value_type,typename T::container_type>>) items.push_back(text(copy.front()));
                        else items.push_back(text(copy.top()));
                        copy.pop();
                    }
                    if (!copy.empty()) items_limit();
                    show_structure(name,items,line,kind,value.size());
                }
            }
        } else if constexpr (pair<T>::value) {
            scalars.push_back(name + " = " + text(value));
            show_structure(name,{"first = " + pair_item<typename bare<T>::first_type>(value.first),"second = " + pair_item<typename bare<T>::second_type>(value.second)},line,kind,2);
        } else if constexpr (record<bare<T>>::value) {
            auto object = object_snapshot(&value, initialized);
            std::vector<std::string> items;
            for (const auto& field : object.fields) items.push_back(field.name + " = " + field.value);
            show_structure(name,items,line,"record",items.size());
            roots.push_back({name, object.id});
            objects.push_back(std::move(object));
        } else if constexpr (std::is_pointer_v<T> && !std::is_function_v<std::remove_pointer_t<T>>) {
            scalars.push_back(name + " = " + text(value));
            roots.push_back({name, pointer_id(value)});
        }
    }

    template<class T> void graph(const std::string& name, const T& value, bool edge_list = false) {
        if (!active) return;
        names.push_back(name);
        if constexpr (sequence<bare<T>>::value) {
            using Row = bare<decltype(*std::begin(value))>;
            std::set<int> nodes;
            Edges edges;
            size_t index = 0;
            size_t edge_count = 0;
            for (const auto& row : value) {
                if (index == max_items) { items_limit(); break; }
                if constexpr (sequence<Row>::value) {
                    using Entry = bare<decltype(*std::begin(row))>;
                    int source = static_cast<int>(index);
                    nodes.insert(source);
                    for (const auto& entry : row) {
                        if (++edge_count > max_items) { items_limit(); break; }
                        if constexpr (std::is_integral_v<Entry>) {
                            int target = static_cast<int>(entry);
                            nodes.insert(target);
                            edges[{source,target}] = 1;
                        } else if constexpr (pair<Entry>::value) {
                            if constexpr (std::is_integral_v<bare<decltype(entry.first)>> && std::is_integral_v<bare<decltype(entry.second)>>) {
                                int target = static_cast<int>(entry.first);
                                nodes.insert(target);
                                edges[{source,target}] = static_cast<int>(entry.second);
                            }
                        }
                    }
                } else if constexpr (pair<Row>::value) {
                    if constexpr (std::is_integral_v<bare<decltype(row.first)>> && std::is_integral_v<bare<decltype(row.second)>>) {
                        int source = static_cast<int>(row.first), target = static_cast<int>(row.second);
                        nodes.insert(source); nodes.insert(target); edges[{source,target}] = 1;
                    }
                } else {
                    observe(name,value);
                    return;
                }
                ++index;
            }
            graph_snapshot(name,std::move(nodes),std::move(edges),line);
        } else {
            observe(name,value);
        }
    }
};

template<class C,class I> decltype(auto) read(const char* name, C& container, I index, int line) {
    if constexpr (sequence<bare<C>>::value || bits<bare<C>>::value) {
        if (program_started && (index < 0 || static_cast<size_t>(index) >= std::size(container))) {
            fail_execution("RUNTIME_ERROR", "Índice fora dos limites na linha " + std::to_string(line) + ": " + name + "[" + std::to_string(index) + "]. Confira os dados de entrada e os limites do vetor.", line);
        }
    }
    if (enabled()) {
        const auto size = std::size(container);
        if (index >= 0 && static_cast<size_t>(index) < std::min<size_t>(size,max_items) && vectors.count(name)) {
            if (read_line != line) {
                for (const auto& entry : vectors) reset_vector(entry.first,line);
                read_line = line;
                accesses.clear();
            }
            viz::vector_mark(name,static_cast<int>(index),viz::VectorState::Comparing,line);
            auto value = text(container[index]);
            using Item = bare<decltype(container[index])>;
            auto label = distance_label(name, container[index]);
            if (!label.empty()) value = label;
            if constexpr (std::is_same_v<Item,char>) {
                auto ch = container[index];
                if (ch >= 32 && ch < 127) value = "'" + std::string(1,ch) + "'";
            }
            if (accesses.size() == 2) accesses.erase(accesses.begin());
            accesses.push_back({name,static_cast<int>(index),value});
            auto caption = std::string("Lê ") + name + "[" + std::to_string(index) + "] = " + value;
            viz::step(caption,line);
            ++frame_count;
        } else if (active_graph == name && graph_nodes.count(static_cast<int>(index))) {
            for (int id : processed_nodes) viz::graph_node_state(id, viz::NodeState::Done, line);
            processed_nodes.insert(static_cast<int>(index));
            viz::highlight(static_cast<int>(index),"orange",line);
            viz::step("Processa vértice " + std::to_string(index),line);
            ++frame_count;
        }
    }
    return container[index];
}

inline bool condition(bool value, int line, bool search = false) {
    if (enabled()) {
        std::string caption = value ? "Condição verdadeira" : "Condição falsa";
        if (read_line == line && accesses.size() == 2) {
            const auto& a = accesses[0]; const auto& b = accesses[1];
            caption = "Compara " + a.name + "[" + std::to_string(a.index) + "] = " + a.value + " com " + b.name + "[" + std::to_string(b.index) + "] = " + b.value + (value ? ": verdadeiro" : ": falso");
            if (a.name == b.name) viz::vector_compare(a.name,a.index,b.index,caption,line);
        }
        if (search && value && read_line == line && accesses.size() == 1) {
            const auto& access = accesses[0];
            found_indices[access.name].insert(access.index);
            viz::vector_mark(access.name, access.index, viz::VectorState::Found, line);
            caption = "Valor encontrado em " + access.name + "[" + std::to_string(access.index) + "]";
        }
        viz::step(caption,line);
        ++frame_count;
        read_line = -1;
        matrix_reads.clear();
    }
    return value;
}

template<class C,class I> void written(const char* name, const C& container, I index, int line) {
    if (!enabled() || index < 0 || !vectors.count(name) || static_cast<size_t>(index) >= vectors[name].size()) return;
    using Item = bare<decltype(container[index])>;
    if constexpr (number<Item>) {
        long double value = static_cast<long double>(container[index]);
        if (!std::isfinite(value)) return;
        auto label = exact_label(name, container[index]);
        std::string caption = std::string("Atualiza ") + name + "[" + std::to_string(index) + "] = " + (label.empty() ? text(container[index]) : label);
        std::ostringstream fields;
        fields.imbue(std::locale::classic());
        fields << ",\"index\":" << index << ",\"value\":" << std::setprecision(17) << static_cast<double>(value);
        fields << ",\"value_label\":" << label_json(label);
        found_indices[name].erase(static_cast<int>(index));
        reset_vector(name,line);
        viz::emit_named("VECTOR_SET",name,fields.str()+viz::caption_field(caption),line);
        vectors[name][index] = value;
        if (vector_labels.count(name) && static_cast<size_t>(index) < vector_labels[name].size()) vector_labels[name][index] = label;
        viz::step(caption,line);
        ++frame_count;
    }
}

inline void match(const char* text_name, const char* pattern_name, int position, int length, int line) {
    if (!enabled() || position < 0 || length <= 0) return;
    auto a = vectors.find(text_name), b = vectors.find(pattern_name);
    if (a == vectors.end() || b == vectors.end() || static_cast<size_t>(length) != b->second.size()
        || static_cast<size_t>(position) + length > a->second.size()) return;
    for (int i=0; i<length; ++i) if (a->second[position+i] != b->second[i]) return;
    viz::vector_reset(text_name,line); viz::vector_reset(pattern_name,line);
    for (int i=0; i<length; ++i) {
        found_indices[text_name].insert(position+i);
        found_indices[pattern_name].insert(i);
        viz::vector_mark(text_name,position+i,viz::VectorState::Found,line);
        viz::vector_mark(pattern_name,i,viz::VectorState::Found,line);
    }
    viz::step("Padrão encontrado na posição " + std::to_string(position),line);
    ++frame_count;
}

inline void finish() {
    flush_output(0);
    if (!enabled()) return;
    for (const auto& entry : completed_vectors) if (!vectors.count(entry.first)) {
        vectors[entry.first] = entry.second;
        vector_labels[entry.first] = completed_vector_labels[entry.first];
        found_indices[entry.first] = completed_found_indices[entry.first];
        if (completed_sorting_vectors.count(entry.first)) sorting_vectors.insert(entry.first);
        if (completed_truncated_vectors.count(entry.first)) truncated_vectors.insert(entry.first);
        // Recreate an authoritative final snapshot after VARIABLE_END and the
        // caller's FRAME_SCOPE removed the callee's local display.
        auto labels = vector_labels[entry.first];
        viz::emit_named("VECTOR_INIT",entry.first,values_json(entry.second) + (labels.size()==entry.second.size() ? labels_json(labels) : ""),0);
        auto meta = completed_metadata[entry.first];
        if (!meta.empty()) { metadata_cache[entry.first] = meta; viz::emit_named("VECTOR_META",entry.first,meta,0); }
    }
    for (const auto& entry : completed_structures) if (!structure_items.count(entry.first))
        show_structure(entry.first,entry.second,0,completed_structure_kinds[entry.first],completed_structure_sizes[entry.first],completed_structure_opaque[entry.first]);
    for (const auto& entry : completed_matrices) if (!matrix_cache.count(entry.first)) {
        const auto& shape = completed_matrix_shapes[entry.first];
        show_matrix(entry.first,entry.second,0,completed_matrix_sizes[entry.first],shape.first,shape.second);
    }
    for (const auto& entry : vectors) {
        reset_vector(entry.first, 0);
        const auto& values = entry.second;
        if (sorting_vectors.count(entry.first) && !truncated_vectors.count(entry.first) &&
            (std::is_sorted(values.begin(), values.end()) || std::is_sorted(values.rbegin(), values.rend()))) {
            for (size_t i = 0; i < values.size(); ++i) viz::vector_mark(entry.first, static_cast<int>(i), viz::VectorState::Sorted, 0);
        }
        auto label_fields = vector_labels.count(entry.first) && vector_labels[entry.first].size()==values.size() ? labels_json(vector_labels[entry.first]) : "";
        viz::emit_named("VECTOR_RESULT", entry.first, values_json(values) + label_fields + viz::caption_field("Execução concluída"), 0);
    }
    for (int id : processed_nodes) if (graph_nodes.count(id)) viz::graph_node_state(id, viz::NodeState::Done, 0);
    for (int id : reached_nodes) if (graph_nodes.count(id)) viz::graph_node_state(id, viz::NodeState::Done, 0);
    for (const auto& entry : graph_parents) if (has_edge(entry.second, entry.first)) viz::graph_edge_state(entry.second, entry.first, viz::EdgeState::Tree, 0);
    bool path_found = false;
    for (const auto& entry : graph_paths) {
        if (!valid_path(entry.second)) continue;
        path_found = true;
        for (size_t i = 0; i < entry.second.size(); ++i) viz::vector_mark(entry.first, static_cast<int>(i), viz::VectorState::Found, 0);
        viz::event_stream() << "{\"step_event\":\"GRAPH_PATH\",\"path\":" << viz::integers_json(entry.second) << ",\"color\":\"green\",\"line\":0}\n";
    }
    if (!last_scalars.empty()) show_structure("Variáveis", last_scalars, 0);
    show_structure("Execução", {"concluída"}, 0);
    viz::step(path_found ? "Execução concluída — caminho encontrado" : "Execução concluída", 0);
    ++frame_count;
}

class Completion {
public:
    ~Completion() { if (std::uncaught_exceptions() == 0) finish(); }
};

} // namespace runspect_auto
#endif
