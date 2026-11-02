/**
 * js/player.js
 * 玩家第一人称控制器与完整 AABB 包围盒物理碰撞检测模块
 * 支持：
 * 1. X / Z 轴独立分离式水平防穿墙碰撞检测
 * 2. Y 轴脚底落地检测 (onGround) 与头顶碰撞反弹清零
 * 3. 放置方块时的玩家自身 AABB 防重叠校验
 */
(function (global) {
  'use strict';

  const EPSILON = 0.0001;

  class PlayerController {
    constructor(camera, world, domElement, callbacks) {
      this.camera = camera;
      this.world = world;
      this.domElement = domElement;
      this.callbacks = callbacks || {};

      // 玩家物理尺寸 (标准 Minecraft 比例：宽 0.6，高 1.75，眼高 1.55)
      this.radius = 0.3;
      this.height = 1.75;
      this.eyeHeight = 1.55;

      // 物理状态
      this.position = new THREE.Vector3(32.5, 20.0, 32.5);
      this.velocity = new THREE.Vector3(0, 0, 0);
      this.yaw = 0;
      this.pitch = -0.15;
      this.onGround = false;

      // 运动参数
      this.walkSpeed = 5.4;
      this.sprintSpeed = 8.2;
      this.jumpVelocity = 8.4;
      this.gravity = 24.0;

      // 输入按键状态
      this.keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false,
        sprint: false
      };

      this.isPointerLocked = false;
      this.isDraggingLook = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;

      this.selectedBlockId = 1;
      this.reachDistance = 6.5;
      this.raycaster = new THREE.Raycaster();
      this.raycaster.near = 0.1;
      this.raycaster.far = this.reachDistance;

      // 当前准星指向的目标方块信息
      this.targetedBlock = null;

      this._bindEvents();
    }

    /**
     * 将玩家重置到世界中心地表的安全位置
     */
    respawnAtCenter() {
      const cx = Math.floor(this.world.sizeX / 2);
      const cz = Math.floor(this.world.sizeZ / 2);
      const surfaceY = this.world.getSurfaceHeight(cx, cz);
      this.position.set(cx + 0.5, surfaceY + 0.05, cz + 0.5);
      this.velocity.set(0, 0, 0);
      this.onGround = false;
      this._syncCamera();
    }

    /**
     * 获取给定脚底坐标 pos 对应的玩家 AABB 包围盒边界
     */
    getAABB(pos) {
      return {
        minX: pos.x - this.radius,
        maxX: pos.x + this.radius,
        minY: pos.y,
        maxY: pos.y + this.height,
        minZ: pos.z - this.radius,
        maxZ: pos.z + this.radius
      };
    }

    /**
     * 检查指定方块坐标 (bx, by, bz) 是否与当前玩家 AABB 重叠（防止放置方块卡住自己）
     */
    intersectsBlock(bx, by, bz) {
      const box = this.getAABB(this.position);
      return (
        box.maxX > bx + EPSILON &&
        box.minX < bx + 1 - EPSILON &&
        box.maxY > by + EPSILON &&
        box.minY < by + 1 - EPSILON &&
        box.maxZ > bz + EPSILON &&
        box.minZ < bz + 1 - EPSILON
      );
    }

    /**
     * 核心 AABB 碰撞检测与分轴解算 (X -> Z -> Y)
     */
    update(dt) {
      const clampedDt = Math.min(dt, 0.05);

      // 1. 计算水平期望速度向量
      const forwardX = -Math.sin(this.yaw);
      const forwardZ = -Math.cos(this.yaw);
      const rightX = Math.cos(this.yaw);
      const rightZ = -Math.sin(this.yaw);

      let moveX = 0;
      let moveZ = 0;
      if (this.keys.forward) {
        moveX += forwardX;
        moveZ += forwardZ;
      }
      if (this.keys.backward) {
        moveX -= forwardX;
        moveZ -= forwardZ;
      }
      if (this.keys.right) {
        moveX += rightX;
        moveZ += rightZ;
      }
      if (this.keys.left) {
        moveX -= rightX;
        moveZ -= rightZ;
      }

      const moveLen = Math.hypot(moveX, moveZ);
      const speed = this.keys.sprint ? this.sprintSpeed : this.walkSpeed;
      if (moveLen > 0) {
        this.velocity.x = (moveX / moveLen) * speed;
        this.velocity.z = (moveZ / moveLen) * speed;
      } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }

      // 2. 跳跃与重力更新
      if (this.keys.jump && this.onGround) {
        this.velocity.y = this.jumpVelocity;
        this.onGround = false;
        if (this.callbacks.onJump) this.callbacks.onJump();
      }
      this.velocity.y -= this.gravity * clampedDt;
      if (this.velocity.y < -32) {
        this.velocity.y = -32;
      }

      // 3. 分轴移动与 AABB 碰撞消解
      this._moveAxisX(this.velocity.x * clampedDt);
      this._moveAxisZ(this.velocity.z * clampedDt);
      this._moveAxisY(this.velocity.y * clampedDt);

      // 4. 限制在 64x64 区块边界内部，防止掉出世界外
      const minBound = this.radius + 0.01;
      const maxBoundX = this.world.sizeX - this.radius - 0.01;
      const maxBoundZ = this.world.sizeZ - this.radius - 0.01;
      this.position.x = Math.max(minBound, Math.min(maxBoundX, this.position.x));
      this.position.z = Math.max(minBound, Math.min(maxBoundZ, this.position.z));

      if (this.position.y < -10) {
        this.respawnAtCenter();
      }

      this._syncCamera();
      this._updateRaycastTarget();
    }

    /**
     * X 轴方向移动与水平防穿墙检测
     */
    _moveAxisX(dx) {
      if (dx === 0) return;
      this.position.x += dx;
      const box = this.getAABB(this.position);

      const startX = Math.floor(box.minX + EPSILON);
      const endX = Math.floor(box.maxX - EPSILON);
      const startY = Math.floor(box.minY + EPSILON);
      const endY = Math.floor(box.maxY - EPSILON);
      const startZ = Math.floor(box.minZ + EPSILON);
      const endZ = Math.floor(box.maxZ - EPSILON);

      for (let y = startY; y <= endY; y++) {
        for (let z = startZ; z <= endZ; z++) {
          for (let x = startX; x <= endX; x++) {
            if (this.world.getBlock(x, y, z) !== 0) {
              if (dx > 0) {
                this.position.x = x - this.radius - EPSILON;
              } else if (dx < 0) {
                this.position.x = x + 1 + this.radius + EPSILON;
              }
              this.velocity.x = 0;
              return;
            }
          }
        }
      }
    }

    /**
     * Z 轴方向移动与水平防穿墙检测
     */
    _moveAxisZ(dz) {
      if (dz === 0) return;
      this.position.z += dz;
      const box = this.getAABB(this.position);

      const startX = Math.floor(box.minX + EPSILON);
      const endX = Math.floor(box.maxX - EPSILON);
      const startY = Math.floor(box.minY + EPSILON);
      const endY = Math.floor(box.maxY - EPSILON);
      const startZ = Math.floor(box.minZ + EPSILON);
      const endZ = Math.floor(box.maxZ - EPSILON);

      for (let y = startY; y <= endY; y++) {
        for (let z = startZ; z <= endZ; z++) {
          for (let x = startX; x <= endX; x++) {
            if (this.world.getBlock(x, y, z) !== 0) {
              if (dz > 0) {
                this.position.z = z - this.radius - EPSILON;
              } else if (dz < 0) {
                this.position.z = z + 1 + this.radius + EPSILON;
              }
              this.velocity.z = 0;
              return;
            }
          }
        }
      }
    }

    /**
     * Y 轴方向移动：处理头顶碰撞与脚底跳跃落地检测
     */
    _moveAxisY(dy) {
      this.onGround = false;
      if (dy === 0) return;
      this.position.y += dy;
      const box = this.getAABB(this.position);

      const startX = Math.floor(box.minX + EPSILON);
      const endX = Math.floor(box.maxX - EPSILON);
      const startY = Math.floor(box.minY + EPSILON);
      const endY = Math.floor(box.maxY - EPSILON);
      const startZ = Math.floor(box.minZ + EPSILON);
      const endZ = Math.floor(box.maxZ - EPSILON);

      for (let y = startY; y <= endY; y++) {
        for (let z = startZ; z <= endZ; z++) {
          for (let x = startX; x <= endX; x++) {
            if (this.world.getBlock(x, y, z) !== 0) {
              if (dy < 0) {
                // 下落触地
                this.position.y = y + 1;
                this.velocity.y = 0;
                this.onGround = true;
              } else if (dy > 0) {
                // 跳跃撞击头顶方块下表面
                this.position.y = y - this.height - EPSILON;
                this.velocity.y = 0;
              }
              return;
            }
          }
        }
      }
    }

    /**
     * 同步第一人称摄像机位置与朝向
     */
    _syncCamera() {
      this.camera.position.set(
        this.position.x,
        this.position.y + this.eyeHeight,
        this.position.z
      );
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    }

    /**
     * 使用 Raycaster 检测视线正中央指向的体素块及其表面法线
     */
    _updateRaycastTarget() {
      this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
      const meshes = this.world.getPickableMeshes();
      const hits = this.raycaster.intersectObjects(meshes, false);

      if (hits.length > 0) {
        const hit = hits[0];
        const blockId = hit.object.userData.blockId;
        const coordList = this.world.instanceCoordMap[blockId];
        if (coordList && hit.instanceId !== undefined && coordList[hit.instanceId]) {
          const coords = coordList[hit.instanceId];
          const normal = hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0);
          this.targetedBlock = {
            x: coords.x,
            y: coords.y,
            z: coords.z,
            blockId: blockId,
            normal: {
              x: Math.round(normal.x),
              y: Math.round(normal.y),
              z: Math.round(normal.z)
            }
          };
          return;
        }
      }
      this.targetedBlock = null;
    }

    /**
     * 挖掘破坏当前指向的方块
     */
    breakTargetedBlock() {
      if (!this.targetedBlock) return false;
      const { x, y, z } = this.targetedBlock;
      // 保留最底层基岩防止掉入虚空
      if (y === 0) return false;
      const ok = this.world.updateBlock(x, y, z, 0);
      if (ok) {
        this._updateRaycastTarget();
        if (this.callbacks.onBreakBlock) this.callbacks.onBreakBlock(x, y, z);
      }
      return ok;
    }

    /**
     * 在当前指向方块的相邻表面放置新方块（带 AABB 防卡人校验）
     */
    placeTargetedBlock() {
      if (!this.targetedBlock) return false;
      const nx = this.targetedBlock.x + this.targetedBlock.normal.x;
      const ny = this.targetedBlock.y + this.targetedBlock.normal.y;
      const nz = this.targetedBlock.z + this.targetedBlock.normal.z;

      if (!this.world.inBounds(nx, ny, nz)) return false;
      if (this.world.getBlock(nx, ny, nz) !== 0) return false;

      // 如果新放置的方块与玩家自身 AABB 重叠，则拒绝放置
      if (this.intersectsBlock(nx, ny, nz)) {
        return false;
      }

      const ok = this.world.updateBlock(nx, ny, nz, this.selectedBlockId);
      if (ok) {
        this._updateRaycastTarget();
        if (this.callbacks.onPlaceBlock) this.callbacks.onPlaceBlock(nx, ny, nz, this.selectedBlockId);
      }
      return ok;
    }

    _bindEvents() {
      const self = this;

      window.addEventListener('keydown', function (e) {
        if (e.target && e.target.tagName === 'INPUT') return;
        switch (e.code) {
          case 'KeyW':
          case 'ArrowUp':
            self.keys.forward = true;
            break;
          case 'KeyS':
          case 'ArrowDown':
            self.keys.backward = true;
            break;
          case 'KeyA':
          case 'ArrowLeft':
            self.keys.left = true;
            break;
          case 'KeyD':
          case 'ArrowRight':
            self.keys.right = true;
            break;
          case 'Space':
            self.keys.jump = true;
            e.preventDefault();
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
            self.keys.sprint = true;
            break;
          case 'KeyE':
            self.placeTargetedBlock();
            break;
        }
      });

      window.addEventListener('keyup', function (e) {
        switch (e.code) {
          case 'KeyW':
          case 'ArrowUp':
            self.keys.forward = false;
            break;
          case 'KeyS':
          case 'ArrowDown':
            self.keys.backward = false;
            break;
          case 'KeyA':
          case 'ArrowLeft':
            self.keys.left = false;
            break;
          case 'KeyD':
          case 'ArrowRight':
            self.keys.right = false;
            break;
          case 'Space':
            self.keys.jump = false;
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
            self.keys.sprint = false;
            break;
        }
      });

      document.addEventListener('pointerlockchange', function () {
        self.isPointerLocked = (document.pointerLockElement === self.domElement);
      });

      document.addEventListener('mousemove', function (e) {
        const sensitivity = 0.0022;
        if (self.isPointerLocked) {
          self.yaw -= e.movementX * sensitivity;
          self.pitch -= e.movementY * sensitivity;
          self.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, self.pitch));
        } else if (self.isDraggingLook) {
          const dx = e.clientX - self.lastMouseX;
          const dy = e.clientY - self.lastMouseY;
          self.lastMouseX = e.clientX;
          self.lastMouseY = e.clientY;
          self.yaw -= dx * sensitivity * 1.4;
          self.pitch -= dy * sensitivity * 1.4;
          self.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, self.pitch));
        }
      });

      this.domElement.addEventListener('mousedown', function (e) {
        if (e.button === 0) {
          if (self.isPointerLocked) {
            self.breakTargetedBlock();
          } else {
            self.isDraggingLook = true;
            self.lastMouseX = e.clientX;
            self.lastMouseY = e.clientY;
            if (self.domElement.requestPointerLock) {
              try {
                self.domElement.requestPointerLock();
              } catch (_) {}
            }
          }
        } else if (e.button === 2) {
          e.preventDefault();
          self.placeTargetedBlock();
        }
      });

      window.addEventListener('mouseup', function () {
        self.isDraggingLook = false;
      });

      this.domElement.addEventListener('contextmenu', function (e) {
        e.preventDefault();
      });

      // 触屏滑动视角支持
      let touchLookId = null;
      let lastTouchX = 0;
      let lastTouchY = 0;

      this.domElement.addEventListener('touchstart', function (e) {
        if (e.changedTouches.length > 0 && touchLookId === null) {
          const t = e.changedTouches[0];
          touchLookId = t.identifier;
          lastTouchX = t.clientX;
          lastTouchY = t.clientY;
        }
      }, { passive: true });

      this.domElement.addEventListener('touchmove', function (e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === touchLookId) {
            const dx = t.clientX - lastTouchX;
            const dy = t.clientY - lastTouchY;
            lastTouchX = t.clientX;
            lastTouchY = t.clientY;
            self.yaw -= dx * 0.004;
            self.pitch -= dy * 0.004;
            self.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, self.pitch));
          }
        }
      }, { passive: true });

      this.domElement.addEventListener('touchend', function (e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchLookId) {
            touchLookId = null;
          }
        }
      }, { passive: true });
    }
  }

  global.PlayerController = PlayerController;
})(window);
