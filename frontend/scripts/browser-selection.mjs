// Existing scenarios explicitly opt into all panels they exercise.
export async function confirmAllVisualizations(page) {
  const picker = page.getByRole('dialog', { name: 'Escolha o que visualizar' });
  await picker.waitFor();
  await page.waitForFunction(() => document.querySelector('.visualization-picker-confirm')?.disabled === false);
  for (const checkbox of await picker.getByRole('checkbox').all()) await checkbox.check();
  await picker.getByRole('button', { name: 'Executar com seleção', exact: true }).click();
}

export async function mockVisualizationAnalysis(page, getSteps) {
  await page.route('**/api/analyze', route => {
    const capabilities = new Set();
    for (const step of getSteps()) {
      if (step.step_event === 'ADD_NODE' || step.step_event === 'ADD_EDGE') capabilities.add('graph');
      if (step.step_event === 'VECTOR_INIT') capabilities.add('vectors');
      if (step.step_event === 'SET_MATRIX') capabilities.add('matrices');
      if (step.step_event === 'SET_REFERENCES') capabilities.add('references');
      if (step.step_event === 'SET_STRUCT' && step.data?.name !== 'Execução') capabilities.add('structures');
      if (step.step_event === 'CALL_ENTER' && (step.data?.parent != null || step.data?.function !== 'main')) capabilities.add('calls');
      if (step.step_event === 'PROGRAM_OUTPUT') capabilities.add('output');
    }
    return route.fulfill({ json: { success: true, capabilities: [...capabilities] } });
  });
}
