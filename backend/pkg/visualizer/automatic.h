#ifndef RUNSPECT_AUTOMATIC_H
#define RUNSPECT_AUTOMATIC_H

#include "visualizer.h"
#include <algorithm>
#include <array>
#include <bitset>
#include <cmath>
#include <cerrno>
#include <deque>
#include <exception>
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
template<class T> struct tuple : std::false_type {};
template<class... T> struct tuple<std::tuple<T...>> : std::true_type {};
template<class T> struct optional : std::false_type {};
template<class T> struct optional<std::optional<T>> : std::true_type {};
template<class T> struct bits : std::false_type {};
template<size_t N> struct bits<std::bitset<N>> : std::true_type {};
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

template<class T> inline std::string text(const T& value);

template<size_t I, class T> inline std::string tuple_item(const T& value) {
    if constexpr (std::is_reference_v<std::tuple_element_t<I, bare<T>>>) {
        // A tuple can bind a scalar before it is initialized. Do not read it.
        return std::to_string(I) + " = referência não expandida";
    } else {
        return std::to_string(I) + " = " + text(std::get<I>(value));
    }
}

template<class T, size_t... I> inline std::vector<std::string> tuple_items(const T& value, std::index_sequence<I...>) {
    return { tuple_item<I>(value)... };
}

template<class T> inline std::string text(const T& value) {
    if constexpr (std::is_volatile_v<T>) {
        return "valor volatile não expandido";
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
        return "(" + text(value.first) + ", " + text(value.second) + ")";
    } else if constexpr (tuple<bare<T>>::value) {
        constexpr size_t count = std::tuple_size_v<bare<T>>;
        if constexpr (count > max_items) items_limit();
        auto items = tuple_items(value, std::make_index_sequence<std::min(count, max_items)>{});
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
    } else {
        return "tipo não expandido";
    }
}

inline std::map<std::string,std::vector<long double>> vectors;
inline std::map<std::string,std::vector<std::string>> vector_labels;
inline std::map<std::string,std::set<int>> found_indices;
inline std::set<std::string> sorting_vectors;
inline std::set<std::string> truncated_vectors;
inline std::set<long double> infinity_values;
inline std::map<std::string,std::string> structure_cache;
inline std::map<std::string,std::vector<std::vector<std::string>>> matrix_cache;
inline int read_line = -1;
struct Access { std::string name; int index; std::string value; };
inline std::vector<Access> accesses;

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
    const bool labeled = distance_name(name) && labels.size() == current.size();
    auto label_fields = labeled ? labels_json(labels) : "";
    if (previous == vectors.end() || previous->second.size() != current.size()) {
        found_indices.erase(name);
        viz::emit_named("VECTOR_INIT", name, values_json(current) + label_fields, line);
    } else if (previous->second != current) {
        std::vector<size_t> changed;
        for (size_t i = 0; i < current.size(); ++i)
            if (current[i] != previous->second[i]) changed.push_back(i);
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
        read_line = -1;
        accesses.clear();
    }
    template<class T> void observe(const std::string& name, const T& value, bool sorting = false) {
        if (!active) return;
        if constexpr (std::is_arithmetic_v<T> || std::is_enum_v<T>) {
            scalars.push_back(name + " = " + text(value));
            if constexpr (std::is_arithmetic_v<T>) {
                if (name == "INF" || name == "inf" || name == "infinity") infinity_values.insert(static_cast<long double>(value));
            }
        } else if constexpr (sequence<bare<T>>::value) {
            using Item = bare<decltype(*std::begin(value))>;
            if constexpr (std::is_arithmetic_v<Item>) {
                if (std::size(value) > max_items) truncated_vectors.insert(name);
                else truncated_vectors.erase(name);
                std::vector<long double> current;
                std::vector<std::string> labels;
                for (auto item : value) {
                    if (current.size() == max_items) { items_limit(); break; }
                    long double n = static_cast<long double>(item);
                    if (!std::isfinite(n)) return;
                    current.push_back(n);
                    if (distance_name(name)) labels.push_back(distance_label(name, static_cast<Item>(item)));
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
            } else if constexpr (pair<Item>::value || tuple<Item>::value || optional<Item>::value || bits<Item>::value || std::is_same_v<Item,std::string>) {
                std::vector<std::string> items;
                for (const auto& item : value) {
                    if (items.size() == max_items) { items_limit(); break; }
                    items.push_back(text(item));
                }
                show_structure(name,items,line);
            }
        } else if constexpr (bits<bare<T>>::value) {
            std::vector<long double> current;
            if (value.size() > max_items) items_limit();
            for (size_t i = 0; i < std::min(value.size(), max_items); ++i) current.push_back(value[i] ? 1 : 0);
            vector_snapshot(name, current, line);
        } else if constexpr (tuple<bare<T>>::value) {
            constexpr size_t count = std::tuple_size_v<bare<T>>;
            if constexpr (count > max_items) items_limit();
            show_structure(name, tuple_items(value, std::make_index_sequence<std::min(count, max_items)>{}), line);
        } else if constexpr (optional<bare<T>>::value) {
            show_structure(name, {text(value)}, line);
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
    }
    return value;
}

template<class C,class I> void written(const char* name, const C& container, I index, int line) {
    if (!enabled() || index < 0 || !vectors.count(name) || static_cast<size_t>(index) >= vectors[name].size()) return;
    using Item = bare<decltype(container[index])>;
    if constexpr (std::is_arithmetic_v<Item>) {
        long double value = static_cast<long double>(container[index]);
        if (!std::isfinite(value)) return;
        auto label = distance_label(name, container[index]);
        std::string caption = std::string("Atualiza ") + name + "[" + std::to_string(index) + "] = " + (label.empty() ? text(container[index]) : label);
        std::ostringstream fields;
        fields.imbue(std::locale::classic());
        fields << ",\"index\":" << index << ",\"value\":" << std::setprecision(17) << static_cast<double>(value);
        if (distance_name(name)) fields << ",\"value_label\":" << label_json(label);
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
    if (!enabled()) return;
    for (const auto& entry : vectors) {
        reset_vector(entry.first, 0);
        const auto& values = entry.second;
        if (sorting_vectors.count(entry.first) && !truncated_vectors.count(entry.first) &&
            (std::is_sorted(values.begin(), values.end()) || std::is_sorted(values.rbegin(), values.rend()))) {
            for (size_t i = 0; i < values.size(); ++i) viz::vector_mark(entry.first, static_cast<int>(i), viz::VectorState::Sorted, 0);
        }
        auto label_fields = vector_labels.count(entry.first) ? labels_json(vector_labels[entry.first]) : "";
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
