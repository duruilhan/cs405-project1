import paintingUrl from "../../assets/ormanda_karaca.jpeg";
export const paintingHeight = 5.6;
export const paintingCenterY = 0.3;
export const paintingZ = -3;
export async function createPainting(device, format) {
  const response = await fetch(paintingUrl);
  if (!response.ok) throw new Error("Could not load Ormanda Karaca.");
  const image = await createImageBitmap(await response.blob(), {colorSpaceConversion: "none"});
  const width = paintingHeight * image.width / image.height;
  const texture = device.createTexture({
    size: [image.width, image.height],
    format: "rgba8unorm",
    viewFormats: ["rgba8unorm-srgb"],
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });
  device.queue.copyExternalImageToTexture({source: image}, {texture}, [image.width, image.height]);
  image.close();
  const shader = device.createShaderModule({code: `
    @group(0) @binding(0) var<uniform> vp: mat4x4f;
    @group(0) @binding(1) var image: texture_2d<f32>;
    @group(0) @binding(2) var filtering: sampler;
    struct Vertex {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    };
    @vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Vertex {
      let uv = array(
        vec2f(0, 0), vec2f(0, 1), vec2f(1, 0),
        vec2f(1, 0), vec2f(0, 1), vec2f(1, 1)
      )[index];
      let position = vec3f(
        (uv.x - 0.5) * ${width},
        (0.5 - uv.y) * ${paintingHeight} + ${paintingCenterY},
        ${paintingZ}.0
      );
      return Vertex(vp * vec4f(position, 1), uv);
    }
    @fragment fn fragmentMain(input: Vertex) -> @location(0) vec4f {
      let c = textureSample(image, filtering, input.uv).rgb;
      let srgb = select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, 12.92 * c, c <= vec3f(0.0031308));
      return vec4f(srgb, 1);
    }
  `});
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {module: shader, entryPoint: "vertexMain"},
    fragment: {module: shader, entryPoint: "fragmentMain", targets: [{format }]},
    depthStencil: {format: "depth24plus", depthWriteEnabled: true, depthCompare: "less"}
  });
  const uniform = device.createBuffer({size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {binding: 0, resource: {buffer: uniform}},
      {binding: 1, resource: texture.createView({format: "rgba8unorm-srgb" })},
      {binding: 2, resource: device.createSampler({minFilter: "linear", magFilter: "linear"})}
    ]
  });
  return {
    width,
    draw(pass, vp) {
      device.queue.writeBuffer(uniform, 0, vp);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
    }
  };
}