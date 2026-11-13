export function bindReset(onReset) {
  const inputs = [...document.querySelectorAll("aside input, aside select")];
  const defaults = inputs.map(input => [input, input.value, input.checked]);
  document.getElementById("reset").addEventListener("click", () => {
    for (const [input, value, checked] of defaults) {
      input.value = value;
      if (input.type === "checkbox") input.checked = checked;
    }
    onReset();
  });
}
export function createPerformanceReadout(adapter) {
  const output = document.getElementById("performance");
  const info = adapter.info;
  const gpu = info.description || [info.vendor, info.architecture].filter(Boolean).join(" / ") || "Undisclosed";
  document.getElementById("gpu").textContent = gpu;
  let previous;
  let start;
  let frames = 0;
  let sum = 0;
  return (time, vertices) => {
    if (previous === undefined) {
      previous = start = time;
      return;
    }
    sum += time - previous;
    previous = time;
    frames++;
    if (time - start >= 500) {
      output.textContent = `${(sum / frames).toFixed(2)} ms/frame · ${vertices.toLocaleString("en-US")} vertices/frame`;
      frames = sum = 0;
      start = time;
    }
  };
}