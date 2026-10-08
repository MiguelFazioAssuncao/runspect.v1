#ifndef VISUALIZER_H
#define VISUALIZER_H

#include <iostream>
#include <sstream>
#include <string>
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
        std::vector<std::string> line;
        for (const auto& cell : row) {
            std::ostringstream oss;
            oss << cell;
            line.push_back(oss.str());
        }
        out.push_back(line);
    }
    show_matrix(name, out, line);
}

inline void set_multigraph(bool multi, int line = __builtin_LINE()) {
    std::cout << "{\"step_event\":\"SET_MULTI\",\"multi\":"
              << (multi ? "true" : "false") << ",\"line\":" << line << "}\n";
}

}

#endif