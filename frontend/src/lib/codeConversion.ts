const visualizerInclude = /^\s*#include\s+"visualizer\.h"\s*$/gm;

export function convertToPureCpp(source: string): string {
  let converted = source.replace(visualizerInclude, '');
  converted = converted.replace(/viz::(?:print|step)\(([^;]*)\);/g, 'cout << ($1) << "\\n";');
  converted = converted.replace(
    /viz::(?:set_directed|set_weighted|set_multigraph|add_node|add_edge|remove_node|remove_edge|set_weight|highlight|highlight_edge|highlight_path|set_label|set_color|reset_colors|set_badge|set_edge_style|set_edge_label|show|show_matrix)\([^;]*\);/g,
    '',
  );
  return converted
    .replace(/^\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}
