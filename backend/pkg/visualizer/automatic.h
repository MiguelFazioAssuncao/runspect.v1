#ifndef RUNSPECT_AUTOMATIC_H
#define RUNSPECT_AUTOMATIC_H

#include "visualizer.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cerrno>
#include <deque>
#include <iomanip>
#include <iterator>
#include <list>
#include <map>
#include <queue>
#include <set>
#include <stack>
#include <streambuf>
#include <unordered_map>
#include <unordered_set>
#include <unistd.h>

namespace runspect_auto {

// Trace events use FD 3, separate from the user's stdout. No stream redirection
// or extra newline is added to ordinary cout/printf output.
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
        pending.append(data,static_cast<size_t>(count));
        auto end = pending.find_last_of('\n');
        if (end != std::string::npos) {
            if (!write_all(pending.data(),static_cast<std::streamsize>(end+1))) return 0;
            pending.erase(0,end+1);
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

constexpr size_t max_items = 256;
constexpr size_t max_frames = 2000;
inline size_t frame_count = 0;
inline bool program_started = false;
inline bool limit_emitted = false;
inline bool items_limit_emitted = false;

inline bool enabled() {
    if (!program_started) return false;
    connect();
    if (frame_count < max_frames) return true;
    if (!limit_emitted) {
        limit_emitted = true;
        viz::print("Visualização automática limitada a 2000 passos; o programa continua executando.", 0);
    }
    return false;
}

inline void start() { program_started = true; connect(); }

inline void items_limit() {
    if (!items_limit_emitted) {
        items_limit_emitted = true;
        viz::print("Estruturas grandes: a visualização mostra até 256 elementos por estrutura.", 0);
    }
}

template<class T> struct sequence : std::false_type {};
template<class T, class A> struct sequence<std::vector<T,A>> : std::true_type {};
template<class T, size_t N> struct sequence<std::array<T,N>> : std::true_type {};
template<class T, size_t N> struct sequence<T[N]> : std::true_type {};
template<class T, class A> struct sequence<std::deque<T,A>> : std::true_type {};
template<class T, class A> struct sequence<std::list<T,A>> : std::true_type {};
template<class C, class A, class Alloc> struct sequence<std::set<C,A,Alloc>> : std::true_type {};
template<class C, class H, class E, class A> struct sequence<std::unordered_set<C,H,E,A>> : std::true_type {};
template<class C, class Traits, class A> struct sequence<std::basic_string<C,Traits,A>> : std::true_type {};
template<class T> struct pair : std::false_type {};
template<class A, class B> struct pair<std::pair<A,B>> : std::true_type {};
template<class T> struct mapping : std::false_type {};
template<class K, class V, class C, class A> struct mapping<std::map<K,V,C,A>> : std::true_type {};
template<class K, class V, class H, class E, class A> struct mapping<std::unordered_map<K,V,H,E,A>> : std::true_type {};
template<class T> struct adapter : std::false_type {};
template<class T, class C> struct adapter<std::queue<T,C>> : std::true_type {};
template<class T, class C> struct adapter<std::stack<T,C>> : std::true_type {};
template<class T, class C, class P> struct adapter<std::priority_queue<T,C,P>> : std::true_type {};
template<class T> struct priority : std::false_type {};
template<class T, class C, class P> struct priority<std::priority_queue<T,C,P>> : std::true_type {};
template<class T> using bare = std::remove_cv_t<std::remove_reference_t<T>>;

template<class T> inline std::string text(const T& value) {
    if constexpr (std::is_arithmetic_v<T> || std::is_enum_v<T>) {
        std::ostringstream out;
        out.imbue(std::locale::classic());
        if constexpr (std::is_enum_v<T>) out << static_cast<std::underlying_type_t<T>>(value);
        else if constexpr (std::is_same_v<T,char> || std::is_same_v<T,unsigned char> || std::is_same_v<T,signed char>) out << static_cast<int>(value);
        else out << std::setprecision(17) << value;
        return out.str();
    } else if constexpr (std::is_same_v<bare<T>, std::string>) {
        return value.substr(0, max_items);
    } else if constexpr (pair<T>::value) {
        return "(" + text(value.first) + ", " + text(value.second) + ")";
    } else {
        return "tipo não expandido";
    }
}

inline std::map<std::string,std::vector<long double>> vectors;
inline std::map<std::string,std::string> structure_cache;
inline std::map<std::string,std::vector<std::vector<std::string>>> matrix_cache;
inline int read_line = -1;
struct Access { std::string name; int index; std::string value; };
inline std::vector<Access> accesses;

inline void vector_snapshot(const std::string& name, const std::vector<long double>& current, int line) {
    auto previous = vectors.find(name);
    if (previous == vectors.end() || previous->second.size() != current.size()) {
        std::ostringstream json;
        json.imbue(std::locale::classic());
        json << ",\"values\":[";
        for (size_t i = 0; i < current.size(); ++i) {
            if (i) json << ',';
            json << std::setprecision(17) << static_cast<double>(current[i]);
        }
        json << ']';
        viz::emit_named("VECTOR_INIT", name, json.str(), line);
    } else if (previous->second != current) {
        std::vector<size_t> changed;
        for (size_t i = 0; i < current.size(); ++i)
            if (current[i] != previous->second[i]) changed.push_back(i);
        viz::vector_reset(name, line);
        if (changed.size() == 2 && current[changed[0]] == previous->second[changed[1]] && current[changed[1]] == previous->second[changed[0]]) {
            viz::vector_swap(name, static_cast<int>(changed[0]), static_cast<int>(changed[1]), "Troca de elementos", line);
        } else {
            for (auto i : changed) {
                std::ostringstream fields;
                fields.imbue(std::locale::classic());
                fields << ",\"index\":" << i << ",\"value\":" << std::setprecision(17) << static_cast<double>(current[i]);
                viz::emit_named("VECTOR_SET", name, fields.str(), line);
            }
        }
    }
    vectors[name] = current;
}

inline void show_structure(const std::string& name, const std::vector<std::string>& items, int line) {
    std::string key;
    for (const auto& item : items) key += std::to_string(item.size()) + ":" + item;
    auto previous = structure_cache.find(name);
    if (previous == structure_cache.end() || previous->second != key) {
        viz::show(name, items, line);
        structure_cache[name] = key;
    }
}

using Edges = std::map<std::pair<int,int>,int>;
inline std::string active_graph;
inline std::set<int> graph_nodes;
inline Edges graph_edges;
inline bool graph_directed = true;
inline bool graph_started = false;
inline bool graph_weighted = false;

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
    std::string caption;
    int line;
    bool active;
public:
    Frame(const char* caption, int line) : caption(caption), line(line), active(enabled()) {}
    ~Frame() {
        if (!active) return;
        show_structure("Variáveis", scalars, line);
        show_structure("Execução", {"linha " + std::to_string(line)}, line);
        viz::step(caption, line);
        ++frame_count;
    }
    template<class T> void observe(const std::string& name, const T& value) {
        if (!active) return;
        if constexpr (std::is_arithmetic_v<T> || std::is_enum_v<T>) {
            scalars.push_back(name + " = " + text(value));
        } else if constexpr (sequence<bare<T>>::value) {
            using Item = bare<decltype(*std::begin(value))>;
            if constexpr (std::is_arithmetic_v<Item>) {
                std::vector<long double> current;
                for (auto item : value) {
                    if (current.size() == max_items) { items_limit(); break; }
                    long double n = static_cast<long double>(item);
                    if (!std::isfinite(n)) return;
                    current.push_back(n);
                }
                vector_snapshot(name, current, line);
            } else if constexpr (sequence<Item>::value) {
                using Cell = bare<decltype(*std::begin(*std::begin(value)))>;
                if constexpr (std::is_arithmetic_v<Cell>) {
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
                    auto old = matrix_cache.find(name);
                    if (old == matrix_cache.end() || old->second != rows) {
                        viz::show_matrix(name, rows, line);
                        matrix_cache[name] = std::move(rows);
                    }
                }
            } else if constexpr (pair<Item>::value || std::is_same_v<Item,std::string>) {
                std::vector<std::string> items;
                for (const auto& item : value) {
                    if (items.size() == max_items) { items_limit(); break; }
                    items.push_back(text(item));
                }
                show_structure(name,items,line);
            }
        } else if constexpr (mapping<bare<T>>::value) {
            std::vector<std::string> items;
            for (const auto& item : value) {
                if (items.size() == max_items) { items_limit(); break; }
                items.push_back(text(item.first) + " → " + text(item.second));
            }
            show_structure(name,items,line);
        } else if constexpr (adapter<bare<T>>::value) {
            if constexpr (std::is_arithmetic_v<typename T::value_type>) {
                // Popping a copied heap would invoke a user-defined comparator.
                if constexpr (priority<T>::value) {
                    std::vector<std::string> items;
                    if (!value.empty()) items.push_back("topo = " + text(value.top()));
                    items.push_back("tamanho = " + std::to_string(value.size()));
                    show_structure(name,items,line);
                    return;
                }
                if (value.size() > max_items) {
                    items_limit();
                    show_structure(name,{"estrutura grande: " + std::to_string(value.size()) + " elementos"},line);
                    return;
                }
                auto copy = value;
                std::vector<std::string> items;
                while (!copy.empty() && items.size() < max_items) {
                    if constexpr (std::is_same_v<T,std::queue<typename T::value_type,typename T::container_type>>) items.push_back(text(copy.front()));
                    else items.push_back(text(copy.top()));
                    copy.pop();
                }
                if (!copy.empty()) items_limit();
                show_structure(name,items,line);
            }
        } else if constexpr (pair<T>::value) {
            scalars.push_back(name + " = " + text(value));
        }
    }

    template<class T> void graph(const std::string& name, const T& value, bool edge_list = false) {
        if (!active) return;
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
    if (enabled()) {
        const auto size = std::size(container);
        if (index >= 0 && static_cast<size_t>(index) < std::min<size_t>(size,max_items) && vectors.count(name)) {
            if (read_line != line) {
                for (const auto& entry : vectors) viz::vector_reset(entry.first,line);
                read_line = line;
                accesses.clear();
            }
            viz::vector_mark(name,static_cast<int>(index),viz::VectorState::Comparing,line);
            auto value = text(container[index]);
            using Item = bare<decltype(container[index])>;
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
            viz::reset_colors(line);
            viz::highlight(static_cast<int>(index),"orange",line);
            viz::step("Processa vértice " + std::to_string(index),line);
            ++frame_count;
        }
    }
    return container[index];
}

inline bool condition(bool value, int line) {
    if (enabled()) {
        std::string caption = value ? "Condição verdadeira" : "Condição falsa";
        if (read_line == line && accesses.size() == 2) {
            const auto& a = accesses[0]; const auto& b = accesses[1];
            caption = "Compara " + a.name + "[" + std::to_string(a.index) + "] = " + a.value + " com " + b.name + "[" + std::to_string(b.index) + "] = " + b.value + (value ? ": verdadeiro" : ": falso");
            if (a.name == b.name) viz::vector_compare(a.name,a.index,b.index,caption,line);
        }
        viz::step(caption,line);
        ++frame_count;
        read_line = -1;
    }
    return value;
}

template<class C,class I> void written(const char* name, const C& container, I index, int line) {
    if (!enabled() || index < 0 || !vectors.count(name) || static_cast<size_t>(index) >= vectors[name].size()) return;
    using Item = bare<decltype(container[index])>;
    if constexpr (std::is_arithmetic_v<Item>) {
        long double value = static_cast<long double>(container[index]);
        if (!std::isfinite(value)) return;
        std::string caption = std::string("Atualiza ") + name + "[" + std::to_string(index) + "] = " + text(container[index]);
        std::ostringstream fields;
        fields.imbue(std::locale::classic());
        fields << ",\"index\":" << index << ",\"value\":" << std::setprecision(17) << static_cast<double>(value);
        viz::vector_reset(name,line);
        viz::emit_named("VECTOR_SET",name,fields.str()+viz::caption_field(caption),line);
        vectors[name][index] = value;
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
        viz::vector_mark(text_name,position+i,viz::VectorState::Found,line);
        viz::vector_mark(pattern_name,i,viz::VectorState::Found,line);
    }
    viz::step("Padrão encontrado na posição " + std::to_string(position),line);
    ++frame_count;
}

} // namespace runspect_auto
#endif
