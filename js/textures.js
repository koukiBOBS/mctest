/**

js/textures.js
程序化 16x16 像素噪点纹理与材质生成模块
使用 HTML5 Canvas API 动态绘制材质并配置 THREE.NearestFilter 保持像素锐利感*/(function (global) {'use strict';

const BLOCK_DEFS = {1: { id: 1, name: '草方块', key: 'grass' },2: { id: 2, name: '泥土', key: 'dirt' },3: { id: 3, name: '岩石', key: 'stone' },4: { id: 4, name: '橡木原木', key: 'wood' },5: { id: 5, name: '树叶', key: 'leaves' },6: { id: 6, name: '沙子', key: 'sand' },7: { id: 7, name: '木板', key: 'planks' },8: { id: 8, name: '圆石', key: 'cobble' }};

// 确定性伪随机数生成器，保证每次生成的 16x16 像素纹理风格一致且富有层次function createPRNG(seed) {let s = seed >>> 0;return function () {s = (s * 1664525 + 1013904223) >>> 0;return (s & 0xfffffff) / 0x10000000;};}

function clampChannel(v) {return Math.max(0, Math.min(255, Math.round(v)));}

function rgbCss(r, g, b) {return 'rgb(' + clampChannel(r) + ',' + clampChannel(g) + ',' + clampChannel(b) + ')';}

/**

创建 16x16 像素画布并通过自定义像素着色回调绘制图案*/function createPixelCanvas(seed, pixelPainter) {const canvas = document.createElement('canvas');canvas.width = 16;canvas.height = 16;const ctx = canvas.getContext('2d');const rand = createPRNG(seed);

for (let y = 0; y < 16; y++) {

  for (let x = 0; x < 16; x++) {

    ctx.fillStyle = pixelPainter(x, y, rand);

    ctx.fillRect(x, y, 1, 1);

  }

}

return canvas
;}

/**

将 16x16 Canvas 转换为 THREE.CanvasTexture，严格使用 NearestFilter*/function createNearestTexture(canvas) {const texture = new THREE.CanvasTexture(canvas);texture.magFilter = THREE.NearestFilter;texture.minFilter = THREE.NearestFilter;texture.wrapS = THREE.ClampToEdgeWrapping;texture.wrapT = THREE.ClampToEdgeWrapping;texture.needsUpdate = true;return texture;}

/**

构建所有方块纹理画布与 Three.js 材质字典*/function createTextureRegistry() {// 1. 草方块顶部 (16x16 翠绿像素噪点)const grassTopCanvas = createPixelCanvas(101, function (x, y, rand) {const n = (rand() - 0.5) * 32;const blade = rand() > 0.78 ? 14 : 0;return rgbCss(78 + n * 0.7, 168 + n + blade, 54 + n * 0.6);});

// 2. 泥土 / 草方块底部 (16x16 棕褐色带矿物颗粒像素噪点)

const dirtCanvas = createPixelCanvas(202, function (x, y, rand) {

  const n = (rand() - 0.5) * 34;

  const pebble = rand() > 0.86 ? -18 : (rand() < 0.08 ? 16 : 0);

  return rgbCss(134 + n + pebble, 94 + n * 0.8 + pebble, 62 + n * 0.6 + pebble);

});

// 3. 草方块侧面 (顶部不规则草皮垂落 + 下方泥土纹理)

const grassSideCanvas = createPixelCanvas(303, function (x, y, rand) {

  // 每个 X 列的草皮垂落深度在 2 到 5 像素之间变化

  const columnHash = ((x * 73 + 19) % 4) + 2;

  if (y < columnHash) {

    const n = (rand() - 0.5) * 28;

    const edgeShadow = (y === columnHash - 1) ? -14 : 0;

    return rgbCss(76 + n * 0.7 + edgeShadow, 164 + n + edgeShadow, 52 + n * 0.6 + edgeShadow);

  }

  const n = (rand() - 0.5) * 34;

  const pebble = rand() > 0.85 ? -16 : 0;

  return rgbCss(134 + n + pebble, 94 + n * 0.8 + pebble, 62 + n * 0.6 + pebble);

});

// 4. 岩石 (灰阶层理噪点)

const stoneCanvas = createPixelCanvas(404, function (x, y, rand) {

  const streak = ((x + y * 3) % 5 === 0) ? -10 : 0;

  const n = (rand() - 0.5) * 30 + streak;

  return rgbCss(126 + n, 130 + n, 136 + n);

});

// 5. 橡木原木侧面 (纵向树皮纹理)

const woodSideCanvas = createPixelCanvas(505, function (x, y, rand) {

  const ridge = (x % 4 === 0 || x % 4 === 1) ? -12 : 8
;const n = (rand() - 0.5) * 20;return rgbCss(104 + ridge + n, 78 + ridge * 0.8 + n, 46 + ridge * 0.5 + n);});// 6. 橡木原木截面 (年轮像素图案)

const woodTopCanvas = createPixelCanvas(606, function (x, y, rand) {

  const dx = x - 7.5;

  const dy = y - 7.5;

  const dist = Math.max(Math.abs(dx), Math.abs(dy));

  const n = (rand() - 0.5) * 14;

  if (dist > 6.2) {

    // 外圈树皮

    return rgbCss(96 + n, 72 + n, 42 + n);

  }

  const ring = (Math.floor(dist) % 2 === 0) ? 10 : -8;

  return rgbCss(166 + ring + n, 132 + ring * 0.8 + n, 84 + ring * 0.6 + n);

});

// 7. 树叶 (深浅交错的簇状像素树叶)

const leavesCanvas = createPixelCanvas(707, function (x, y, rand) {

  const cluster = ((x * 3 + y * 5) % 4 === 0) ? -18 : 10;

  const n = (rand() - 0.5) * 32;

  return rgbCss(46 + cluster * 0.6 + n * 0.5, 128 + cluster + n, 38 + cluster * 0.5 + n * 0.5);

});

// 8. 沙子 (暖黄细密波纹像素噪点)

const sandCanvas = createPixelCanvas(808, function (x, y, rand) {

  const wave = ((x + y * 2) % 6 === 0) ? 10 : -4;

  const n = (rand() - 0.5) * 22 + wave;

  return rgbCss(224 + n, 206 + n, 148 + n);

});

// 9. 木板 (水平拼接缝隙像素木纹)

const planksCanvas = createPixelCanvas(909, function (x, y, rand) {

  const isGroove = (y % 4 === 0) || (x === ((Math.floor(y / 4) * 7 + 5) % 16));

  const grooveOffset = isGroove ? -24 : 0;

  const n = (rand() - 0.5) * 18 + grooveOffset;

  return rgbCss(176 + n, 136 + n * 0.8, 86 + n * 0.6);

});

// 10. 圆石 (卵石网格与暗缝像素纹理)

const cobbleCanvas = createPixelCanvas(1010, function (x, y, rand) {

  const cell = ((x * 5 + y * 7) % 6 === 0) || ((x * 3 - y * 5 + 32) % 7 === 0);

  const mortar = cell ? -28 : 8;

  const n = (rand() - 0.5) * 26 + mortar;

  return rgbCss(116 + n, 120 + n, 124 + n);

});

const tex = {

  grassTop: createNearestTexture(grassTopCanvas),

  dirt: createNearestTexture(dirtCanvas),

  grassSide: createNearestTexture(grassSideCanvas),

  stone: createNearestTexture(stoneCanvas),

  woodSide: createNearestTexture(woodSideCanvas),

  woodTop: createNearestTexture(woodTopCanvas),

  leaves: createNearestTexture(leavesCanvas),

  sand: createNearestTexture(sandCanvas),

  planks: createNearestTexture(planksCanvas),

  cobble: createNearestTexture(cobbleCanvas)

};

const previewCanvases = {

  1: grassSideCanvas,

  2: dirtCanvas,

  3: stoneCanvas,

  4: woodSideCanvas,

  5: leavesCanvas,

  6: sandCanvas,

  7: planksCanvas,

  8: cobbleCanvas

};

// Three.js BoxGeometry 材质顺序: [+X(右), -X(左), +Y(顶), -Y(底), +Z(前), -Z(后)]

const materials = {

  // 1: 草方块 — 严格区分顶部(翠绿草皮)、侧面(草皮垂落+泥土)和底部(泥土)

  1: [

    new THREE.MeshLambertMaterial({ map: tex.grassSide }),

    new THREE.MeshLambertMaterial({ map: tex.grassSide }),

    new THREE.MeshLambertMaterial({ map: tex.grassTop }),

    new THREE.MeshLambertMaterial({ map: tex.dirt }),

    new THREE.MeshLambertMaterial({ map: tex.grassSide }),

    new THREE.MeshLambertMaterial({ map: tex.grassSide })

  ],

  // 2: 泥土

  2: new THREE.MeshLambertMaterial({ map: tex.dirt }),

  // 3: 岩石

  3: new THREE.MeshLambertMaterial({ map: tex.stone }),

  // 4: 橡木原木 — 区分侧面树皮与上下年轮截面

  4: [

    new THREE.MeshLambertMaterial({ map: tex.woodSide }),

    new THREE.MeshLambertMaterial({ map: tex.woodSide }),

    new THREE.MeshLambertMaterial({ map: tex.woodTop }),

    new THREE.MeshLambertMaterial({ map: tex.woodTop }),

    new THREE.MeshLambertMaterial({ map: tex.woodSide }),

    new THREE.MeshLambertMaterial({ map: tex.woodSide })

  ],

  // 5: 树叶

  5: new THREE.MeshLambertMaterial({ map: tex.leaves }),

  // 6: 沙子

  6: new THREE.MeshLambertMaterial({ map: tex.sand }),

  // 7: 木板

  7: new THREE.MeshLambertMaterial({ map: tex.planks }),

  // 8: 圆石

  8: new THREE.MeshLambertMaterial({ map: tex.cobble })

};

return {

  BLOCK_DEFS: BLOCK_DEFS,

  textures: tex,

  materials: materials,

  previewCanvases: previewCanvases,

  renderHotbarPreviews: function () {

    const canvases = document.querySelectorAll('canvas[data-preview]');

    canvases.forEach(function (el) {

      const id = Number(el.getAttribute('data-preview'));

      const src = previewCanvases[id];

      if (!src) return;

      const ctx = el.getContext('2d');

      ctx.imageSmoothingEnabled = false;

      ctx.clearRect(0, 0, el.width, el.height);

      ctx.drawImage(src, 0, 0, el.width, el.height);

    });

  }

}
;}

global.VoxelTextures = {BLOCK_DEFS: BLOCK_DEFS,createTextureRegistry: createTextureRegistry};})(window);