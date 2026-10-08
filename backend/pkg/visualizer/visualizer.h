#ifndef VISUALIZER_H
#define VISUALIZER_H

#include <iostream>
#include <sstream>
#include <string>
#include <type_traits>
#include <vector>

namespace viz {

inline std::string escape_json(const std::string& value) {
    std::string escaped;
    escaped.reserve(value.size());
    for (char character : value) {
        switch (character) {
            case '\\': escaped += "\\\\"; break;
            case '"': escaped += "\\\""; break;
            case '\n': escaped += "\\n"; break;
            case '\r': escaped += "\\r"; break;
            case '\t': escaped += "\\t"; break;
            default: escaped += character;
        }
    }
    return escaped;
}

inline void set_directed(bool directed, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_DIRECTED\",\"directed\":"
              << (directed ? "true" : "false") << ",\"line\":" << line << "}\n";
}

inline void set_weighted(bool weighted, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_WEIGHTED\",\"weighted\":"
              << (weighted ? "true" : "false") << ",\"line\":" << line << "}\n";
}

inline void add_node(int id, const std::string& label = "", int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"ADD_NODE\",\"id\":" << id
              << ",\"label\":\"" << escape_json(label) << "\",\"line\":" << line << "}\n";
}

inline void add_edge(int u, int v, int weight = 1, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"ADD_EDGE\",\"u\":" << u
              << ",\"v\":" << v << ",\"weight\":" << weight << ",\"line\":" << line << "}\n";
}

inline void remove_node(int id, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"REMOVE_NODE\",\"id\":" << id << ",\"line\":" << line << "}\n";
}

inline void remove_edge(int u, int v, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"REMOVE_EDGE\",\"u\":" << u
              << ",\"v\":" << v << ",\"line\":" << line << "}\n";
}

inline void set_weight(int u, int v, int weight, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_WEIGHT\",\"u\":" << u
              << ",\"v\":" << v << ",\"weight\":" << weight << ",\"line\":" << line << "}\n";
}

inline void highlight(int id, const std::string& color = "red", int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"HIGHLIGHT\",\"id\":" << id
              << ",\"color\":\"" << escape_json(color) << "\",\"line\":" << line << "}\n";
}

inline void highlight_edge(int u, int v, const std::string& color = "red",
                           int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"HIGHLIGHT_EDGE\",\"u\":" << u
              << ",\"v\":" << v
              << ",\"color\":\"" << escape_json(color) << "\",\"line\":" << line << "}\n";
}

inline void highlight_path(const std::vector<int>& path, const std::string& color = "emerald",
                           int line = __builtin_LINE()) {
    for (size_t i = 0; i < path.size(); i++) {
        highlight(path[i], color, line);
        if (i + 1 < path.size()) highlight_edge(path[i], path[i + 1], color, line);
    }
}

inline void reset_colors(int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"RESET_COLORS\",\"line\":" << line << "}\n";
}

inline void set_label(int id, const std::string& label, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_LABEL\",\"id\":" << id
              << ",\"label\":\"" << escape_json(label) << "\",\"line\":" << line << "}\n";
}

inline void set_color(int id, const std::string& color, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_COLOR\",\"id\":" << id
              << ",\"color\":\"" << escape_json(color) << "\",\"line\":" << line << "}\n";
}

inline void step(const std::string& caption, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"STEP\",\"caption\":\""
              << escape_json(caption) << "\",\"line\":" << line << "}" << std::endl;
}

inline void set_badge(int id, const std::string& text, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_BADGE\",\"id\":" << id
              << ",\"text\":\"" << escape_json(text) << "\",\"line\":" << line << "}" << std::endl;
}

inline void set_edge_style(int u, int v, const std::string& style, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_EDGE_STYLE\",\"u\":" << u
              << ",\"v\":" << v << ",\"style\":\"" << escape_json(style)
              << "\",\"line\":" << line << "}" << std::endl;
}

inline void set_edge_label(int u, int v, const std::string& label, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_EDGE_LABEL\",\"u\":" << u
              << ",\"v\":" << v << ",\"label\":\"" << escape_json(label)
              << "\",\"line\":" << line << "}" << std::endl;
}

template <typename T>
inline void print(const T& value, int line = __builtin_LINE()) {
    std::ostringstream oss;
    oss << value;
    std::cout << "{\"step_event\":\"PRINT\",\"message\":\""
              << escape_json(oss.str()) << "\",\"line\":" << line << "}\n";
}

inline void show(const std::string& name, const std::vector<std::string>& items,
                 int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_STRUCT\",\"name\":\"" << escape_json(name)
              << "\",\"items\":[";
    for (size_t i = 0; i < items.size(); i++) {
        if (i) std::cout << ",";
        std::cout << "\"" << escape_json(items[i]) << "\"";
    }
    std::cout << "],\"line\":" << line << "}\n";
}

template <typename T>
inline void show(const std::string& name, const std::vector<T>& items,
                 int line = __builtin_LINE()) {
    std::vector<std::string> out;
    for (const auto& item : items) {
        std::ostringstream oss;
        oss << item;
        out.push_back(oss.str());
    }
    show(name, out, line);
}

inline void show_matrix(const std::string& name,
                        const std::vector<std::vector<std::string>>& rows,
                        int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_MATRIX\",\"name\":\"" << escape_json(name)
              << "\",\"rows\":[";
    for (size_t r = 0; r < rows.size(); r++) {
        if (r) std::cout << ",";
        std::cout << "[";
        for (size_t c = 0; c < rows[r].size(); c++) {
            if (c) std::cout << ",";
            std::cout << "\"" << escape_json(rows[r][c]) << "\"";
        }
        std::cout << "]";
    }
    std::cout << "],\"line\":" << line << "}\n";
}

template <typename T>
inline void show_matrix(const std::string& name, const std::vector<std::vector<T>>& matrix,
                        int line = __builtin_LINE()) {
    std::vector<std::vector<std::string>> out;
    for (const auto& row : matrix) {
        std::vector<std::string> cells;
        for (const auto& cell : row) {
            std::ostringstream oss;
            oss << cell;
            cells.push_back(oss.str());
        }
        out.push_back(cells);
    }
    show_matrix(name, out, line);
}

inline void set_multigraph(bool multi, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_MULTI\",\"multi\":"
              << (multi ? "true" : "false") << ",\"line\":" << line << "}\n";
}

enum class VectorState { Default, Comparing, Swapping, Pivot, Sorted, Active, Discarded, Found };
enum class NodeState { Queued, Visiting, Done };
enum class EdgeState { Candidate, Accepted, Rejected, Relaxed, Tree, Removed };

inline const char* state_name(VectorState state) {
    switch (state) {
        case VectorState::Default: return "default";
        case VectorState::Comparing: return "comparing";
        case VectorState::Swapping: return "swapping";
        case VectorState::Pivot: return "pivot";
        case VectorState::Sorted: return "sorted";
        case VectorState::Active: return "active";
        case VectorState::Discarded: return "discarded";
        case VectorState::Found: return "found";
    }
    return "default";
}

inline const char* state_name(NodeState state) {
    switch (state) {
        case NodeState::Queued: return "queued";
        case NodeState::Visiting: return "visiting";
        case NodeState::Done: return "done";
    }
    return "queued";
}

inline const char* state_name(EdgeState state) {
    switch (state) {
        case EdgeState::Candidate: return "candidate";
        case EdgeState::Accepted: return "accepted";
        case EdgeState::Rejected: return "rejected";
        case EdgeState::Relaxed: return "relaxed";
        case EdgeState::Tree: return "tree";
        case EdgeState::Removed: return "removed";
    }
    return "candidate";
}

template <typename T>
inline std::string integers_json(const std::vector<T>& values) {
    static_assert(std::is_integral<T>::value, "viz::vector_* aceita apenas vetores de inteiros");
    std::string out = "[";
    for (size_t i = 0; i < values.size(); i++) {
        if (i) out += ",";
        out += std::to_string(static_cast<long long>(values[i]));
    }
    return out + "]";
}

inline std::string caption_field(const std::string& caption) {
    return ",\"caption\":\"" + escape_json(caption) + "\"";
}

inline std::string pair_fields(int a, int b) {
    return ",\"a\":" + std::to_string(a) + ",\"b\":" + std::to_string(b);
}

inline std::string range_fields(int begin, int end) {
    return ",\"begin\":" + std::to_string(begin) + ",\"end\":" + std::to_string(end);
}

inline std::string index_field(int index) {
    return ",\"index\":" + std::to_string(index);
}

inline void emit_named(const char* event, const std::string& name, const std::string& fields,
                       int line, bool flush = false) {
    std::cout << "{\"step_event\":\"" << event << "\",\"name\":\"" << escape_json(name) << "\""
              << fields << ",\"line\":" << line << "}";
    if (flush) std::cout << std::endl;
    else std::cout << "\n";
}

template <typename T>
inline void vector_init(const std::string& name, const std::vector<T>& values,
                        int line = __builtin_LINE()) {
    emit_named("VECTOR_INIT", name, ",\"values\":" + integers_json(values), line);
}

inline void vector_compare(const std::string& name, int a, int b, const std::string& caption = "",
                           int line = __builtin_LINE()) {
    emit_named("VECTOR_COMPARE", name, pair_fields(a, b) + caption_field(caption), line);
}

inline void vector_swap(const std::string& name, int a, int b, const std::string& caption = "",
                        int line = __builtin_LINE()) {
    emit_named("VECTOR_SWAP", name, pair_fields(a, b) + caption_field(caption), line);
}

inline void vector_set(const std::string& name, int index, long long value,
                       const std::string& caption = "", int line = __builtin_LINE()) {
    emit_named("VECTOR_SET", name,
               index_field(index) + ",\"value\":" + std::to_string(value) + caption_field(caption),
               line);
}

inline void vector_mark(const std::string& name, int index, VectorState state,
                        int line = __builtin_LINE()) {
    emit_named("VECTOR_MARK", name,
               index_field(index) + ",\"state\":\"" + state_name(state) + "\"", line);
}

inline void vector_range(const std::string& name, int begin, int end,
                         const std::string& caption = "", int line = __builtin_LINE()) {
    emit_named("VECTOR_RANGE", name, range_fields(begin, end) + caption_field(caption), line);
}

inline void vector_discard(const std::string& name, int begin, int end,
                           int line = __builtin_LINE()) {
    emit_named("VECTOR_DISCARD", name, range_fields(begin, end), line);
}

inline void vector_probe(const std::string& name, int index, const std::string& caption = "",
                         int line = __builtin_LINE()) {
    emit_named("VECTOR_PROBE", name, index_field(index) + caption_field(caption), line);
}

inline void vector_pivot(const std::string& name, int index, const std::string& caption = "",
                         int line = __builtin_LINE()) {
    emit_named("VECTOR_PIVOT", name, index_field(index) + caption_field(caption), line);
}

inline void vector_reset(const std::string& name, int line = __builtin_LINE()) {
    emit_named("VECTOR_RESET", name, "", line);
}

inline void vector_step(const std::string& name, const std::string& caption = "",
                        int line = __builtin_LINE()) {
    emit_named("VECTOR_STEP", name, caption_field(caption), line, true);
}

template <typename T>
inline void vector_result(const std::string& name, const std::vector<T>& values,
                          int line = __builtin_LINE()) {
    emit_named("VECTOR_RESULT", name, ",\"values\":" + integers_json(values), line);
}

inline void graph_node_state(int id, NodeState state, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"GRAPH_NODE\",\"id\":" << id << ",\"state\":\""
              << state_name(state) << "\",\"line\":" << line << "}\n";
}

inline void graph_edge_state(int u, int v, EdgeState state, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"GRAPH_EDGE\",\"u\":" << u << ",\"v\":" << v
              << ",\"state\":\"" << state_name(state) << "\",\"line\":" << line << "}\n";
}

inline void graph_value(int id, const std::string& text, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"GRAPH_VALUE\",\"id\":" << id << ",\"text\":\""
              << escape_json(text) << "\",\"line\":" << line << "}\n";
}

inline void graph_component(int id, int component, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"GRAPH_COMPONENT\",\"id\":" << id
              << ",\"component\":" << component << ",\"line\":" << line << "}\n";
}

inline void graph_path(const std::vector<int>& path, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"GRAPH_PATH\",\"path\":" << integers_json(path)
              << ",\"line\":" << line << "}\n";
}

inline void graph_reset(int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"GRAPH_RESET\",\"line\":" << line << "}\n";
}

}

#endif