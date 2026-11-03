/**

js/world.js
Simplex Noise 算法实现、64x64x32 程序化地形与树木生成、
以及基于暴露面剔除 (Surface Culling) 与按方块类型分组的 THREE.InstancedMesh 渲染优化*/(function (global) {'use strict';

/**

经典 2D/3D Simplex Noise 实现 (Stefan Gustavson 算法)*/class SimplexNoise {constructor(seed) {const s = (typeof seed === 'number' ? seed : 1337) >>> 0;this.p = new Uint8Array(256);for (let i = 0; i < 256; i++) {this.p[i] = i;}let n = s || 1;for (let i = 255; i > 0; i--) {n = (n * 1664525 + 1013904223) >>> 0;const r = n % (i + 1);const tmp = this.p[i];this.p[i] = this.p[r];this.p[r] = tmp;}this.perm = new Uint8Array(512);this.permMod12 = new Uint8Array(512);for (let i = 0; i < 512; i++) {this.perm[i] = this.p[i & 255];this.permMod12[i] = this.perm[i] % 12;}this.grad3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);this.F2 = 0.5 * (Math.sqrt(3.0) - 1.0);this.G2 = (3.0 - Math.sqrt(3.0)) / 6.0;}

noise2D(xin, yin) {

  const F2 = this.F2;

  const G2 = this.G2;

  const grad3 = this.grad3;

  const perm = this.perm;

  const permMod12 = this.permMod12;

  let n0 = 0, n1 = 0, n2 = 0;

  const s = (xin + yin) * F2;

  const i = Math.floor(xin + s);

  const j = Math.floor(yin + s);

  const t = (i + j) * G2;

  const X0 = i - t;

  const Y0 = j - t;

  const x0 = xin - X0;

  const y0 = yin - Y0;

  let i1, j1;

  if (x0 > y0) {

    i1 = 1;

    j1 = 0;

  } else {

    i1 = 0;

    j1 = 1;

  }

  const x1 = x0 - i1 + G2;

  const y1 = y0 - j1 + G2;

  const x2 = x0 - 1.0 + 2.0 * G2;

  const y2 = y0 - 1.0 + 2.0 * G2;

  const ii = i & 255;

  const jj = j & 255;

  const gi0 = permMod12[ii + perm[jj]] * 3;

  const gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3;

  const gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3;

  let t0 = 0.5 - x0 * x0 - y0 * y0;

  if (t0 >= 0) {

    t0 *= t0;

    n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0);

  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;

  if (t1 >= 0) {

    t1 *= t1;

    n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1);

  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;

  if (t2 >= 0) {

    t2 *= t2;

    n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2);

  }
  return 70.0 * (n0 + n1 + n2);}}

/**

64x64x32 体素世界管理器
结合按方块类型分组的 InstancedMesh 与暴露在空气中的表面剔除优化*/class VoxelWorld {constructor(scene, textureRegistry, options) {const opts = options || {};this.scene = scene;this.textureRegistry = textureRegistry;this.sizeX = opts.sizeX || 64;this.sizeZ = opts.sizeZ || 64;this.maxHeight = opts.maxHeight || 32;this.seed = opts.seed || 20261101;

this.voxels = new Uint8Array(this.sizeX * this.maxHeight * this.sizeZ);this.group = new THREE.Group();this.scene.add(this.group);  this.sharedGeometry = new THREE.BoxGeometry(1, 1, 1);

  this.instancedMeshes = {};

  this.instanceCoordMap = {};

  this.totalSolidBlocks = 0;

  this.renderedExposedBlocks = 0;

}

getIndex(x, y, z) {

  return x + this.sizeX * (z + this.sizeZ * y);

}

inBounds(x, y, z) {

  return (

    x >= 0 && x < this.sizeX &&

    y >= 0 && y < this.maxHeight &&

    z >= 0 && z < this.sizeZ

  );

}

getBlock(x, y, z) {

  if (!this.inBounds(x, y, z)) return 0;

  return this.voxels[this.getIndex(x, y, z)];

}

setBlockData(x, y, z, blockId) {

  if (!this.inBounds(x, y, z)) return false;

  this.voxels[this.getIndex(x, y, z)] = blockId;

  return true;

}

/**

 * 判断方块是否至少有一个相邻面暴露在空气或边界外 (面剔除 / 隐藏体素剔除优化)

 */

isBlockExposed(x, y, z) {

  if (this.getBlock(x, y, z) === 0) return false;

  // 位于区块最外层或底部边界时视为可见边缘

  if (

    x === 0 || x === this.sizeX - 1 ||

    z === 0 || z === this.sizeZ - 1 ||

    y === 0 || y === this.maxHeight - 1

  ) {

    return true;

  }

  return (

    this.getBlock(x + 1, y, z) === 0 ||

    this.getBlock(x - 1, y, z) === 0 ||

    this.getBlock(x, y + 1, z) === 0 ||

    this.getBlock(x, y - 1, z) === 0 ||

    this.getBlock(x, y, z + 1) === 0 ||

    this.getBlock(x, y, z - 1) === 0

  );

}

/**

 * 使用多层 Simplex Noise 生成起伏山丘、开阔平原、沙地低谷与橡木林

 */

generate(newSeed) {

  if (typeof newSeed === 'number' && !Number.isNaN(newSeed)) {

    this.seed = newSeed;

  }

  this.voxels.fill(0);

  const simplex = new SimplexNoise(this.seed);

  const detailSimplex = new SimplexNoise(this.seed + 7919);

  const treeSimplex = new SimplexNoise(this.seed + 15485863);

  const heightMap = new Uint8Array(this.sizeX * this.sizeZ);

  for (let z = 0; z < this.sizeZ; z++) {

    for (let x = 0; x < this.sizeX; x++) {

      // 生物群系权重：区分平坦平原与起伏山丘

      const biomeFactor = (simplex.noise2D(x / 48, z / 48) + 1) * 0.5;

      const continent = simplex.noise2D(x / 32, z / 32);

      const hills = detailSimplex.noise2D(x / 15, z / 15);

      const micro = detailSimplex.noise2D(x / 7, z / 7) * 0.25;

      // 平原高度约 7-11，山丘可隆起至 22（预留空间给树木与玩家建造，最大高度 32）

      const baseElevation = 8 + continent * 3.5;

      const hillAmplitude = biomeFactor * biomeFactor * 10.5;

      let h = Math.round(baseElevation + (hills * 0.75 + micro) * hillAmplitude);

      h = Math.max(3, Math.min(this.maxHeight - 8, h));

      heightMap[x + z * this.sizeX] = h;

      for (let y = 0; y <= h; y++) {

        if (y === 0) {

          this.setBlockData(x, y, z, 3); // 底层基岩/岩石

        } else if (y < h - 3) {

          this.setBlockData(x, y, z, 3); // 岩石层

        } else if (y < h) {

          this.setBlockData(x, y, z, 2); // 泥土层

        } else {

          // 地表方块：低洼处生成沙地，其余生成草方块

          if (h <= 6) {

            this.setBlockData(x, y, z, 6);

          } else {

            this.setBlockData(x, y, z, 1);

          }

        }

      }

    }

  }

  // 在平坦或缓坡草地上生成橡木树结构 (树干 + 多层树冠)

  const treeLocations = [];

  for (let z = 4; z < this.sizeZ - 4; z += 2) {

    for (let x = 4; x < this.sizeX - 4; x += 2) {

      // 出生点中央区域保持开阔，避免玩家卡在树干里

      if (Math.abs(x - 32) < 4 && Math.abs(z - 32) < 4) continue;

      const h = heightMap[x + z * this.sizeX];

      if (h <= 6 || h >= this.maxHeight - 8) continue;

      const nVal = treeSimplex.noise2D(x * 0.35, z * 0.35);

      if (nVal > 0.62) {

        // 确保与其它树木保持间距

        let tooClose = false;

        for (let i = 0; i < treeLocations.length; i++) {

          const dx = treeLocations[i].x - x;

          const dz = treeLocations[i].z - z;

          if (dx * dx + dz * dz < 25) {

            tooClose = true;

            break;

          }

        }

        if (!tooClose) {

          treeLocations.push({ x: x, z: z, h: h });

          this.buildTree(x, h + 1, z, ((x * 31 + z * 17) % 2) + 4);

        }

      }

    }

  }

  this.rebuildMeshes();

}

/**

 * 生成单棵体素树木（橡木原木树干 + 立体树叶冠）

 */

buildTree(wx, baseY, wz, trunkHeight) {

  // 树干

  for (let ty = 0; ty < trunkHeight; ty++) {

    if (baseY + ty < this.maxHeight) {

      this.setBlockData(wx, baseY + ty, wz, 4);

    }

  }

  // 树冠树叶

  const crownStart = baseY + trunkHeight - 2;

  const crownEnd = baseY + trunkHeight + 1;

  for (let ly = crownStart; ly <= crownEnd; ly++) {

    if (ly < 0 || ly >= this.maxHeight) continue;

    const layerOffset = ly - (baseY + trunkHeight);

    const radius = layerOffset >= 0 ? 1 : 2;

    for (let lx = -radius; lx <= radius; lx++) {

      for (let lz = -radius; lz <= radius; lz++) {

        // 削去四角让树冠更自然

        if (Math.abs(lx) === radius && Math.abs(lz) === radius && layerOffset !== -1) {

          continue;

        }

        const bx = wx + lx;

        const bz = wz + lz;

        if (this.inBounds(bx, ly, bz) && this.getBlock(bx, ly, bz) === 0) {

          this.setBlockData(bx, ly, bz, 5);

        }

      }

    }

  }

}

/**

 * 渲染优化核心：

 * 1. 仅收集至少有 1 个面暴露在空气中的方块（剔除被完全包裹的地下隐藏方块）

 * 2. 按方块类型分组构建 THREE.InstancedMesh，将成千上万个方块合并为极少数的 Draw Calls

 */

rebuildMeshes() {

  // 清理旧 InstancedMesh

  while (this.group.children.length > 0) {

    const child = this.group.children[0];

    this.group.remove(child);

    if (child.dispose) child.dispose();

  }

  this.instancedMeshes = {};

  this.instanceCoordMap = {};

  const buckets = {};

  let solidCount = 0;

  let exposedCount = 0;

  for (let y = 0; y < this.maxHeight; y++) {

    for (let z = 0; z < this.sizeZ; z++) {

      for (let x = 0; x < this.sizeX; x++) {

        const blockId = this.getBlock(x, y, z);

        if (blockId === 0) continue;

        solidCount++;

        if (!this.isBlockExposed(x, y, z)) {

          continue;

        }

        exposedCount++;

        if (!buckets[blockId]) {

          buckets[blockId] = [];

        }

        buckets[blockId].push({ x: x, y: y, z: z });

      }

    }

  }

  this.totalSolidBlocks = solidCount;

  this.renderedExposedBlocks = exposedCount;

  const dummy = new THREE.Object3D();

  const blockIds = Object.keys(buckets);

  for (let i = 0; i < blockIds.length; i++) {

    const blockId = Number(blockIds[i]);

    const list = buckets[blockId];

    if (!list || list.length === 0) continue;

    const material = this.textureRegistry.materials[blockId];

    const geometry = (this.textureRegistry.geometries && this.textureRegistry.geometries[blockId]) || this.sharedGeometry;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);

    mesh.userData.blockId = blockId;

    for (let idx = 0; idx < list.length; idx++) {

      const item = list[idx];

      // 方块占据 [x, x+1] x [y, y+1] x [z, z+1]，中心点位于 +0.5

      dummy.position.set(item.x + 0.5, item.y + 0.5, item.z + 0.5);

      dummy.updateMatrix();

      mesh.setMatrixAt(idx, dummy.matrix);

    }

    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.geometry && !mesh.geometry.boundingSphere) { mesh.geometry.computeBoundingSphere(); }

    this.group.add(mesh);

    this.instancedMeshes[blockId] = mesh;

    this.instanceCoordMap[blockId] = list;

  }

}

/**

 * 动态破坏或放置方块并立即更新暴露表面 InstancedMesh

 */

updateBlock(x, y, z, blockId) {

  if (!this.inBounds(x, y, z)) return false;

  this.setBlockData(x, y, z, blockId);

  this.rebuildMeshes();

  return true;

}

/**

 * 获取指定 (x, z) 列的最高非空方块顶部 Y 坐标，用于计算玩家安全出生点

 */

getSurfaceHeight(x, z) {

  const ix = Math.max(0, Math.min(this.sizeX - 1, Math.floor(x)));

  const iz = Math.max(0, Math.min(this.sizeZ - 1, Math.floor(z)));

  for (let y = this.maxHeight - 1; y >= 0; y--) {

    const b = this.getBlock(ix, y, iz);

    if (b !== 0 && b !== 5) {

      return y + 1;

    }

  }

  return 12;

}

/**

 * 获取所有 InstancedMesh 数组供 Raycaster 射线拾取使用

 */

getPickableMeshes() {

  return this.group.children;

}

}

global.VoxelWorld = VoxelWorld;})(window);