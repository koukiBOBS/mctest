/**
 * js/main.js
 * 游戏主入口模块：负责 Three.js 场景初始化、光照与昼夜系统、选中方块线框高亮、
 * Web Audio 合成音效、HUD 遥测数据更新以及交互事件绑定
 */
(function () {
  'use strict';

  /**
   * 轻量级 Web Audio API 合成器音效（挖掘、放置、跳跃、切换物品栏）
   */
  class SoundEffects {
    constructor() {
      this.ctx = null;
      this.enabled = true;
    }

    _ensureCtx() {
      if (!this.enabled) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
      return this.ctx;
    }

    playTone(freq, duration, type, slideFreq) {
      const ctx = this._ensureCtx();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slideFreq) {
          osc.frequency.exponentialRampToValueAtTime(slideFreq, ctx.currentTime + duration);
        }
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (_) {}
    }

    playBreak() {
      this.playTone(190, 0.09, 'sawtooth', 95);
    }

    playPlace() {
      this.playTone(320, 0.07, 'triangle', 440);
    }

    playJump() {
      this.playTone(240, 0.11, 'sine', 380);
    }

    playSelect() {
      this.playTone(520, 0.04, 'sine', 580);
    }
  }

  function showToast(message) {
    const toast = document.getElementById('toast-banner');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.classList.add('hidden');
    }, 2200);
  }

  function initGame() {
    const container = document.getElementById('game-container');
    const sfx = new SoundEffects();

    // 1. 初始化 Three.js 场景、相机与渲染器
    const scene = new THREE.Scene();
    const daySkyColor = new THREE.Color(0x7dd3fc);
    const nightSkyColor = new THREE.Color(0x0b132b);
    scene.background = daySkyColor.clone();
    scene.fog = new THREE.FogExp2(0x7dd3fc, 0.012);

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      160
    );

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. 光照系统
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.68);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 0.82);
    sunLight.position.set(48, 80, 36);
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x3f6212, 0.25);
    scene.add(hemiLight);

    // 3. 初始化 16x16 程序化像素纹理与材质注册表
    const textureRegistry = window.VoxelTextures.createTextureRegistry();
    textureRegistry.renderHotbarPreviews();

    // 4. 创建 64x64x32 体素世界并生成地形
    const seedInput = document.getElementById('seed-input');
    const initialSeed = Number(seedInput ? seedInput.value : 20261101) || 20261101;
    const world = new window.VoxelWorld(scene, textureRegistry, {
      sizeX: 64,
      sizeZ: 64,
      maxHeight: 32,
      seed: initialSeed
    });
    world.generate(initialSeed);

    // 5. 初始化玩家控制器与 AABB 物理碰撞系统
    const player = new window.PlayerController(camera, world, renderer.domElement, {
      onBreakBlock: function () {
        sfx.playBreak();
      },
      onPlaceBlock: function () {
        sfx.playPlace();
      },
      onJump: function () {
        sfx.playJump();
      }
    });
    player.respawnAtCenter();

    // 6. 准星指向方块的黑色线框高亮盒
    const highlightGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006));
    const highlightMat = new THREE.LineBasicMaterial({ color: 0x0f172a, linewidth: 2 });
    const highlightBox = new THREE.LineSegments(highlightGeo, highlightMat);
    highlightBox.visible = false;
    scene.add(highlightBox);

    // 7. 绑定快捷物品栏切换 (1-8 数字键、滚轮与点击)
    const slots = Array.from(document.querySelectorAll('.hotbar-slot'));
    function selectSlot(index) {
      const normalized = ((index % slots.length) + slots.length) % slots.length;
      slots.forEach(function (btn, idx) {
        btn.classList.toggle('active', idx === normalized);
      });
      const blockId = Number(slots[normalized].getAttribute('data-block'));
      player.selectedBlockId = blockId;
      sfx.playSelect();
    }

    slots.forEach(function (btn, idx) {
      btn.addEventListener('click', function () {
        selectSlot(idx);
      });
    });

    window.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.code.startsWith('Digit')) {
        const num = Number(e.code.replace('Digit', ''));
        if (num >= 1 && num <= slots.length) {
          selectSlot(num - 1);
        }
      } else if (e.code === 'KeyR') {
        regenerateRandomWorld();
      } else if (e.code === 'KeyT') {
        toggleDayNight();
      } else if (e.code === 'KeyM') {
        toggleAudio();
      } else if (e.code === 'KeyH') {
        toggleHelpModal();
      }
    });

    window.addEventListener('wheel', function (e) {
      const currentIdx = slots.findIndex(function (s) {
        return s.classList.contains('active');
      });
      const dir = e.deltaY > 0 ? 1 : -1;
      selectSlot((currentIdx === -1 ? 0 : currentIdx) + dir);
    }, { passive: true });

    // 8. 顶部功能按钮与模态框控制
    let isNight = false;
    function toggleDayNight() {
      isNight = !isNight;
      if (isNight) {
        scene.background.copy(nightSkyColor);
        scene.fog.color.copy(nightSkyColor);
        ambientLight.intensity = 0.28;
        sunLight.intensity = 0.32;
        sunLight.color.setHex(0x93c5fd);
        showToast('已切换至星夜模式');
      } else {
        scene.background.copy(daySkyColor);
        scene.fog.color.copy(daySkyColor);
        ambientLight.intensity = 0.68;
        sunLight.intensity = 0.82;
        sunLight.color.setHex(0xfffbeb);
        showToast('已切换至晴朗白昼');
      }
    }

    function regenerateRandomWorld() {
      const nextSeed = Math.floor(100000 + Math.random() * 90000000);
      if (seedInput) seedInput.value = String(nextSeed);
      world.generate(nextSeed);
      player.respawnAtCenter();
      showToast('已生成新世界 (Seed: ' + nextSeed + ')');
    }

    function toggleAudio() {
      sfx.enabled = !sfx.enabled;
      const btnAudio = document.getElementById('btn-audio');
      if (btnAudio) {
        btnAudio.textContent = sfx.enabled ? '音效: 开启 (M)' : '音效: 静音 (M)';
      }
      showToast(sfx.enabled ? '合成音效已开启' : '合成音效已静音');
    }

    const overlayModal = document.getElementById('overlay-modal');
    function toggleHelpModal(forceClose) {
      if (!overlayModal) return;
      if (forceClose === true) {
        overlayModal.classList.add('hidden');
      } else {
        overlayModal.classList.toggle('hidden');
      }
    }

    document.getElementById('btn-seed').addEventListener('click', regenerateRandomWorld);
    document.getElementById('btn-time').addEventListener('click', toggleDayNight);
    document.getElementById('btn-audio').addEventListener('click', toggleAudio);
    document.getElementById('btn-help').addEventListener('click', function () {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      toggleHelpModal(false);
    });

    document.getElementById('btn-apply-seed').addEventListener('click', function () {
      const customSeed = Number(seedInput ? seedInput.value : 20261101) || 20261101;
      world.generate(customSeed);
      player.respawnAtCenter();
      toggleHelpModal(true);
      showToast('已应用种子 ' + customSeed + ' 重建地形');
    });

    document.getElementById('btn-resume').addEventListener('click', function () {
      toggleHelpModal(true);
      if (renderer.domElement.requestPointerLock) {
        try {
          renderer.domElement.requestPointerLock();
        } catch (_) {}
      }
    });

    // 9. 绑定触屏虚拟按钮
    const moveButtons = document.querySelectorAll('[data-move]');
    moveButtons.forEach(function (btn) {
      const dir = btn.getAttribute('data-move');
      const startMove = function (e) {
        e.preventDefault();
        player.keys[dir] = true;
      };
      const endMove = function (e) {
        e.preventDefault();
        player.keys[dir] = false;
      };
      btn.addEventListener('mousedown', startMove);
      btn.addEventListener('mouseup', endMove);
      btn.addEventListener('mouseleave', endMove);
      btn.addEventListener('touchstart', startMove, { passive: false });
      btn.addEventListener('touchend', endMove, { passive: false });
    });

    const btnDig = document.getElementById('touch-dig');
    const btnPlace = document.getElementById('touch-place');
    const btnJump = document.getElementById('touch-jump');

    if (btnDig) {
      btnDig.addEventListener('click', function () {
        player.breakTargetedBlock();
      });
    }
    if (btnPlace) {
      btnPlace.addEventListener('click', function () {
        player.placeTargetedBlock();
      });
    }
    if (btnJump) {
      btnJump.addEventListener('touchstart', function (e) {
        e.preventDefault();
        player.keys.jump = true;
      }, { passive: false });
      btnJump.addEventListener('touchend', function (e) {
        e.preventDefault();
        player.keys.jump = false;
      }, { passive: false });
      btnJump.addEventListener('mousedown', function () {
        player.keys.jump = true;
      });
      btnJump.addEventListener('mouseup', function () {
        player.keys.jump = false;
      });
    }

    // 10. 窗口自适应
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // 11. 渲染主循环与 HUD 遥测刷新
    const fpsEl = document.getElementById('fps-display');
    const cullEl = document.getElementById('cull-display');
    const posEl = document.getElementById('pos-display');
    const biomeEl = document.getElementById('biome-display');
    const targetEl = document.getElementById('target-display');

    let lastTime = performance.now();
    let frameCounter = 0;
    let fpsAccumulator = 0;

    function animate(now) {
      requestAnimationFrame(animate);

      const dt = (now - lastTime) / 1000;
      lastTime = now;

      player.update(dt);

      // 更新选中方块高亮框
      if (player.targetedBlock) {
        highlightBox.visible = true;
        highlightBox.position.set(
          player.targetedBlock.x + 0.5,
          player.targetedBlock.y + 0.5,
          player.targetedBlock.z + 0.5
        );
      } else {
        highlightBox.visible = false;
      }

      renderer.render(scene, camera);

      // 统计与更新 HUD 面板
      frameCounter++;
      fpsAccumulator += dt;
      if (fpsAccumulator >= 0.25) {
        const fps = Math.round(frameCounter / fpsAccumulator);
        frameCounter = 0;
        fpsAccumulator = 0;

        if (fpsEl) fpsEl.textContent = 'FPS: ' + fps;
        if (cullEl) {
          const ratio = world.totalSolidBlocks > 0
            ? Math.round((1 - world.renderedExposedBlocks / world.totalSolidBlocks) * 100)
            : 0;
          cullEl.textContent =
            '表面实例: ' + world.renderedExposedBlocks + ' / ' + world.totalSolidBlocks + ' (剔除 ' + ratio + '%)';
        }
        if (posEl) {
          posEl.textContent =
            '坐标 X: ' + player.position.x.toFixed(1) +
            ' Y: ' + player.position.y.toFixed(1) +
            ' Z: ' + player.position.z.toFixed(1);
        }
        if (biomeEl) {
          const py = player.position.y;
          biomeEl.textContent = py > 15 ? '地形: 高山丘陵' : (py <= 7.5 ? '地形: 河谷沙洲' : '地形: 翠绿平原');
        }
        if (targetEl) {
          if (player.targetedBlock) {
            const def = window.VoxelTextures.BLOCK_DEFS[player.targetedBlock.blockId];
            targetEl.textContent =
              '目标: ' + (def ? def.name : '方块') +
              ' [' + player.targetedBlock.x + ',' + player.targetedBlock.y + ',' + player.targetedBlock.z + ']';
          } else {
            targetEl.textContent = '目标: 空气';
          }
        }
      }
    }

    requestAnimationFrame(animate);
  }

  window.onload = initGame;
})();
