import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type DeviceMode = 'xrf' | 'scale';
type StepInfo = { title: string; copy: string };
type DeviceInfo = {
  title: string;
  subtitle: string;
  photo: string;
  alt: string;
  photoLabel: string;
  caution: string;
  source: string;
  sourceUrl: string;
  steps: StepInfo[];
};

const devices: Record<DeviceMode, DeviceInfo> = {
  xrf: {
    title: 'محلل XRF مكتبي',
    subtitle: 'فلورية الأشعة السينية — قراءة تركيب السطح بلا خدش ظاهر عادةً.',
    photo: 'images/xrf-bench-analyzer.jpg',
    alt: 'صورة توضيحية لمحلل أشعة سينية فلورية مكتبي لفحص المعادن',
    photoLabel: 'صورة توضيحية لجهاز مكتبي',
    caution: 'مهم: النموذج يشرح المبدأ ولا يشغّل أشعة حقيقية. قراءة الجهاز تخص موضعًا وطبقة سطحية محدودة، وقد تتأثر بالطلاء أو تركيب القطعة. عند الشك خذ قراءات متعددة أو أحِلها إلى مختبر مؤهل. لا تستخدم أجهزة الأشعة إلا بتدريب وإجراءات السلامة.',
    source: 'المبدأ العلمي: Bruker وThermo Fisher Scientific',
    sourceUrl: 'https://www.bruker.com/en/products-and-solutions/elemental-analyzers/xrf-spectrometers/how-does-xrf-work.html',
    steps: [
      { title: '١ · تثبيت العينة', copy: 'توضع القطعة داخل حجرة مغلقة وتُحدد منطقة القياس. استقرار العينة ومكان القراءة مهمان لأن النتيجة تمثل البقعة التي فُحصت.' },
      { title: '٢ · إثارة الذرات', copy: 'أنبوب الأشعة يرسل أشعة سينية أولية نحو العينة. في الواقع لا يرى المشاهد الحزمة، وتعمل الأجهزة بغطاء ومفاتيح أمان.' },
      { title: '٣ · بصمة العناصر', copy: 'تُثار ذرات المادة؛ وعندما تعود إلكتروناتها إلى حالة أقل طاقة تُصدر أشعة فلورية مميزة لكل عنصر مثل الذهب أو النحاس أو الفضة.' },
      { title: '٤ · قراءة الطيف', copy: 'كاشف مثل SDD يسجل طاقة الإشارات وشدتها، ثم يحلل البرنامج القمم ليقدّر العناصر ونسبها. هذه قراءة تحليلية تحتاج تفسيرًا ومعرفة بحدود الجهاز.' },
    ],
  },
  scale: {
    title: 'ميزان المجوهرات الدقيق',
    subtitle: 'الحمل يسبب تغيرًا صغيرًا في حساس القوة، وتحوّله الدائرة إلى قراءة رقمية.',
    photo: 'images/jewelry-scale.jpg',
    alt: 'ميزان رقمي صغير لوزن المجوهرات والذهب',
    photoLabel: 'صورة توضيحية لميزان رقمي',
    caution: 'الميزان يقيس الكتلة ولا يحدد العيار. صفّر الميزان قبل الاستخدام، استخدم سطحًا ثابتًا، وتحقق من معايرته ودقة وحدته حسب سياسة المحل. لا تفترض أن الوزن الإجمالي للقطعة هو وزن الذهب الصافي إذا كانت مرصعة.',
    source: 'شرح مبدأ حساس الوزن في هذا النموذج مبسّط لأغراض التعليم.',
    sourceUrl: 'https://www.nist.gov/pml/owm',
    steps: [
      { title: '١ · تهيئة الصفر', copy: 'يوضع الميزان على سطح ثابت ويُصفّر من دون قطعة. زر TARE يطرح وزن الوعاء أو الصينية قبل وزن المشغول.' },
      { title: '٢ · استقرار الحمل', copy: 'تنتقل قوة القطعة عبر كفة الوزن إلى خلية الحمل. في هذا النموذج تنثني الخلية بصريًا بمقدار مبالغ فيه كي يسهل فهم الحركة.' },
      { title: '٣ · إشارة المستشعر', copy: 'تتغير مقاومة مقاييس الانفعال الدقيقة على خلية الحمل. تقيس الدائرة الإلكترونية التغير الصغير وتعايره إلى إشارة مرتبطة بالكتلة.' },
      { title: '٤ · قراءة الوزن', copy: 'بعد ثبات الإشارة يحوّل المحول الرقمي القيمة إلى غرامات على الشاشة. القراءة للوزن فقط، وتظل النقاوة والأحجار والفحص مسؤولية مستقلة.' },
    ],
  },
};

const colors = {
  forest: 0x153b34,
  deep: 0x102722,
  shell: 0xe5e0d3,
  gold: 0xd1a753,
  paleGold: 0xf0d38b,
  mint: 0x70ccb0,
  blue: 0x75a9cf,
  ink: 0x152d29,
  metal: 0x9ca9a3,
};

export function mountDeviceLab(host: HTMLElement, initialMode: DeviceMode = 'xrf'): () => void {
  let mode: DeviceMode = initialMode;
  let step = 0;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer | null = null;
  let controls: OrbitControls | null = null;
  let animationFrame = 0;
  let resizeObserver: ResizeObserver | null = null;
  let model: THREE.Group | null = null;
  let rayPrimary: THREE.Object3D | null = null;
  let raySecondary: THREE.Object3D | null = null;
  let spectrum: THREE.Object3D | null = null;
  let signalLines: THREE.Object3D | null = null;
  let flexBar: THREE.Mesh | null = null;
  let ring: THREE.Object3D | null = null;
  let pulse: THREE.Mesh | null = null;
  let destroyed = false;

  host.innerHTML = `
    <section class="device-lab" aria-label="مختبر ثلاثي الأبعاد للأجهزة">
      <div class="lab-model-column">
        <div class="lab-canvas-shell">
          <canvas class="lab-canvas" aria-label="نموذج ثلاثي الأبعاد تفاعلي للجهاز"></canvas>
          <div class="lab-hud"><span class="lab-badge"><i></i> نموذج تعليمي مبسّط</span><span class="lab-camera-hint">اسحب للتدوير · قرّب بإصبعين</span></div>
          <div class="lab-zoom-controls" aria-label="أدوات التحكم بالكاميرا"><button type="button" data-zoom="in" aria-label="تكبير">＋</button><button type="button" data-zoom="out" aria-label="تصغير">−</button><button type="button" data-reset aria-label="إعادة زاوية العرض">↺</button></div>
          <div class="lab-scene-labels" aria-hidden="true"><span class="scene-label label-one"></span><span class="scene-label label-two"></span><span class="scene-label label-three"></span></div>
          <div class="lab-fallback" hidden>العرض الثلاثي الأبعاد غير متاح على هذا المتصفح. يمكنك متابعة خطوات الشرح والصورة التوضيحية أدناه.</div>
        </div>
        <div class="lab-step-control"><div class="lab-step-intro"><span class="eyebrow">رحلة القياس</span><span class="step-counter" data-step-counter></span></div><div class="lab-step-buttons" data-step-buttons></div><div class="lab-step-copy" aria-live="polite"><h3 data-step-title></h3><p data-step-copy></p></div></div>
      </div>
      <aside class="lab-device-card">
        <div class="lab-mode-switch" role="group" aria-label="اختيار الجهاز"><button type="button" class="is-active" data-device="xrf">محلل XRF</button><button type="button" data-device="scale">الميزان</button></div>
        <div class="lab-photo-wrap"><img class="lab-photo" alt="" loading="lazy"><span data-photo-label></span></div>
        <span class="eyebrow" data-device-subtitle></span><h2 data-device-title></h2>
        <p class="lab-device-caution" data-device-caution></p>
        <a class="lab-source-link" data-device-source target="_blank" rel="noopener noreferrer">اقرأ عن المبدأ العلمي <span aria-hidden="true">↗</span></a>
      </aside>
    </section>`;

  const canvas = host.querySelector<HTMLCanvasElement>('.lab-canvas');
  const photo = host.querySelector<HTMLImageElement>('.lab-photo');
  const fallback = host.querySelector<HTMLElement>('.lab-fallback');
  if (!canvas || !photo || !fallback) return () => undefined;

  const makeMaterial = (color: number, roughness = 0.58, metalness = 0.08) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const basic = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  const addBox = (parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], material: THREE.Material, rotation?: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...pos);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const addSphere = (parent: THREE.Object3D, radius: number, pos: [number, number, number], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const addLine = (parent: THREE.Object3D, points: THREE.Vector3[], material: THREE.Material) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    parent.add(line);
    return line;
  };
  const connectCylinder = (parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) => {
    const delta = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 20), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const makeXrfModel = () => {
    model = new THREE.Group();
    scene.add(model);
    const white = makeMaterial(colors.shell, 0.43, 0.06);
    const trim = makeMaterial(colors.forest, 0.42, 0.14);
    const gold = makeMaterial(colors.gold, 0.23, 0.72);
    const metal = makeMaterial(colors.metal, 0.35, 0.55);
    const glass = new THREE.MeshStandardMaterial({ color: 0x244d45, roughness: 0.2, metalness: 0.15, emissive: 0x102d27 });

    addBox(model, [3.55, 0.26, 2.65], [0, 0.16, 0], trim);
    addBox(model, [3.25, 0.22, 2.35], [0, 0.38, 0], white);
    // Exploded, open-front housing exposes the sample chamber and the instrument parts.
    addBox(model, [3.15, 0.18, 2.24], [0, 1.95, -0.02], white);
    addBox(model, [0.18, 1.55, 2.24], [-1.52, 1.14, -0.02], white);
    addBox(model, [0.18, 1.55, 2.24], [1.52, 1.14, -0.02], white);
    addBox(model, [3.05, 1.45, 0.14], [0, 1.12, -1.08], white);
    addBox(model, [3.14, 0.12, 2.2], [0, 1.83, -0.02], trim);

    // Sample holder and jewelry sample.
    addBox(model, [1.28, 0.13, 1.12], [0, 0.52, 0.26], metal);
    addBox(model, [0.25, 0.28, 0.25], [0, 0.72, 0.18], trim);
    const sample = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.095, 18, 52), gold);
    sample.position.set(0, 0.93, 0.16);
    sample.rotation.x = Math.PI / 2;
    sample.castShadow = true;
    model.add(sample);

    // Primary X-ray source tube, collimator, and beam.
    const sourceA = new THREE.Vector3(-0.88, 1.52, 0.74);
    const samplePoint = new THREE.Vector3(0, 0.98, 0.16);
    connectCylinder(model, new THREE.Vector3(-0.9, 1.58, 0.82), new THREE.Vector3(-0.46, 1.25, 0.46), 0.13, trim);
    connectCylinder(model, new THREE.Vector3(-0.46, 1.25, 0.46), new THREE.Vector3(-0.2, 1.15, 0.32), 0.055, metal);
    rayPrimary = addLine(model, [sourceA, samplePoint], new THREE.LineDashedMaterial({ color: colors.paleGold, dashSize: 0.12, gapSize: 0.07, transparent: true, opacity: 0.95 }));
    (rayPrimary as THREE.Line).computeLineDistances();
    pulse = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: colors.paleGold }));
    pulse.position.copy(sourceA);
    model.add(pulse);

    // Detector above the sample and characteristic fluorescence rays.
    addBox(model, [0.45, 0.28, 0.42], [0.94, 1.49, 0.46], trim);
    addBox(model, [0.32, 0.09, 0.32], [0.94, 1.31, 0.46], makeMaterial(0x70ccb0, 0.25, 0.25));
    raySecondary = new THREE.Group();
    model.add(raySecondary);
    const target = new THREE.Vector3(0.94, 1.31, 0.46);
    [0, 1, 2].forEach((i) => {
      const angle = (i - 1) * 0.12;
      addLine(raySecondary as THREE.Object3D, [new THREE.Vector3(-0.02 + angle, 0.99, 0.22), target], new THREE.LineBasicMaterial({ color: i === 1 ? colors.mint : colors.blue, transparent: true, opacity: 0.84 }));
      addSphere(raySecondary as THREE.Object3D, 0.037, [0.32 + i * 0.06, 1.08 + (i - 1) * 0.08, 0.33], basic(i === 1 ? colors.mint : colors.blue));
    });

    // Front control panel and a simplified spectrum display.
    addBox(model, [1.12, 0.72, 0.12], [-0.94, 0.91, 1.18], trim);
    addBox(model, [0.94, 0.53, 0.035], [-0.94, 0.94, 1.255], glass);
    spectrum = new THREE.Group();
    model.add(spectrum);
    const chartBaseY = 0.75;
    const chartZ = 1.28;
    addLine(spectrum, [new THREE.Vector3(-1.30, chartBaseY, chartZ), new THREE.Vector3(-0.60, chartBaseY, chartZ)], new THREE.LineBasicMaterial({ color: 0x9ac8b6, transparent: true, opacity: 0.6 }));
    [0.14, 0.23, 0.13, 0.36, 0.18, 0.26, 0.11].forEach((height, index) => {
      addBox(spectrum as THREE.Object3D, [0.055, height, 0.018], [-1.24 + index * 0.1, chartBaseY + height / 2, chartZ + 0.012], basic(index === 3 ? colors.paleGold : colors.mint));
    });
    spectrum.visible = false;
    rayPrimary.visible = false;
    raySecondary.visible = false;
    pulse.visible = false;
  };

  const makeScaleModel = () => {
    model = new THREE.Group();
    scene.add(model);
    const housing = makeMaterial(colors.shell, 0.35, 0.1);
    const dark = makeMaterial(colors.forest, 0.32, 0.15);
    const steel = makeMaterial(colors.metal, 0.24, 0.72);
    const gold = makeMaterial(colors.gold, 0.22, 0.7);
    const blue = makeMaterial(colors.blue, 0.32, 0.2);

    addBox(model, [2.75, 0.42, 2.0], [0, 0.28, 0.02], housing);
    addBox(model, [2.5, 0.09, 1.78], [0, 0.53, 0.02], dark);
    addBox(model, [1.9, 0.12, 1.48], [0, 1.02, -0.2], steel);
    addBox(model, [1.55, 0.08, 1.22], [0, 1.11, -0.2], makeMaterial(0xdce4df, 0.25, 0.55));
    ring = new THREE.Group();
    model.add(ring);
    const jewelryRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, 16, 40), gold);
    jewelryRing.position.set(0, 1.25, -0.2);
    jewelryRing.rotation.x = Math.PI / 2;
    ring.add(jewelryRing);
    const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), makeMaterial(0xe7eee7, 0.15, 0.5));
    glint.position.set(0.28, 1.32, -0.2);
    ring.add(glint);

    // Exploded cutaway: force plate, strain-gauge beam, sensor and electronics.
    addBox(model, [0.54, 0.07, 0.48], [0, 0.86, -0.2], dark);
    flexBar = addBox(model, [1.25, 0.09, 0.22], [0, 0.77, -0.2], blue);
    flexBar.userData.baseY = 0.77;
    addBox(model, [0.34, 0.18, 0.28], [0.02, 0.62, -0.2], makeMaterial(0x497e74, 0.34, 0.24));
    addBox(model, [0.44, 0.16, 0.28], [0.67, 0.62, -0.2], dark);
    addBox(model, [0.09, 0.18, 0.06], [0.48, 0.78, -0.07], makeMaterial(colors.paleGold, 0.35, 0.25));
    addBox(model, [0.09, 0.18, 0.06], [0.63, 0.78, -0.07], makeMaterial(colors.paleGold, 0.35, 0.25));

    // Display at the front with a representative reading.
    addBox(model, [1.13, 0.43, 0.1], [0, 0.31, 1.04], dark);
    addBox(model, [0.83, 0.24, 0.035], [0, 0.33, 1.108], new THREE.MeshStandardMaterial({ color: 0xb7d4bb, emissive: 0x173b28, roughness: 0.24 }));
    const digits = new THREE.Group();
    model.add(digits);
    const digitMaterial = basic(0x173b28);
    // Small digital seven-segment-inspired bars, intentionally decorative rather than a calibrated reading.
    const segments = [
      [[-0.23, 0.39], [0.23, 0.39]], [[-0.23, 0.31], [0.23, 0.31]],
      [[-0.23, 0.23], [0.23, 0.23]], [[-0.23, 0.39], [-0.23, 0.31]],
      [[0.23, 0.39], [0.23, 0.31]], [[-0.23, 0.31], [-0.23, 0.23]],
      [[0.23, 0.31], [0.23, 0.23]],
    ];
    segments.forEach(([a, b]) => {
      const from = new THREE.Vector3(a[0], a[1], 1.132);
      const to = new THREE.Vector3(b[0], b[1], 1.132);
      const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x173b28, linewidth: 2 }));
      digits.add(line);
    });
    addSphere(model, 0.035, [0.31, 0.24, 1.13], digitMaterial);

    signalLines = new THREE.Group();
    model.add(signalLines);
    addLine(signalLines, [new THREE.Vector3(0.56, 0.79, -0.05), new THREE.Vector3(0.7, 0.98, 0.28), new THREE.Vector3(0.35, 1.02, 0.65), new THREE.Vector3(0.15, 0.6, 0.98)], new THREE.LineBasicMaterial({ color: colors.mint, transparent: true, opacity: 0.82 }));
    [0, 1, 2].forEach((i) => addSphere(signalLines as THREE.Object3D, 0.045, [0.5 - i * 0.08, 0.85, 0.08 + i * 0.22], basic(colors.mint)));
    signalLines.visible = false;
    flexBar.visible = false;
  };

  const makeScene = () => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(mode === 'xrf' ? 0x142b27 : 0x172d2a);
    scene.fog = new THREE.Fog(0x142b27, 11, 25);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(4.3, 3.2, 5.7);
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = 3.3;
      controls.maxDistance = 10;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.target.set(0, 0.92, 0);

      scene.add(new THREE.HemisphereLight(0xe7e2d2, 0x18342e, 2.0));
      const key = new THREE.DirectionalLight(0xffe2af, 3.0);
      key.position.set(3.5, 6, 4);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      scene.add(key);
      const fill = new THREE.PointLight(0x6bc6a6, 18, 13, 2);
      fill.position.set(-3, 2.8, 1);
      scene.add(fill);

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshStandardMaterial({ color: colors.deep, roughness: 0.9 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0.015;
      ground.receiveShadow = true;
      scene.add(ground);
      const grid = new THREE.GridHelper(12, 24, 0x3b675c, 0x29453e);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.24;
      grid.position.y = 0.025;
      scene.add(grid);

      if (mode === 'xrf') makeXrfModel(); else makeScaleModel();
      updateModelStep();
      fallback.hidden = true;
      return true;
    } catch (error) {
      console.warn('3D device scene is unavailable', error);
      fallback.hidden = false;
      return false;
    }
  };

  const stepList = () => devices[mode].steps;
  const setStep = (index: number) => {
    step = Math.max(0, Math.min(index, stepList().length - 1));
    const info = stepList()[step];
    const title = host.querySelector<HTMLElement>('[data-step-title]');
    const copy = host.querySelector<HTMLElement>('[data-step-copy]');
    const counter = host.querySelector<HTMLElement>('[data-step-counter]');
    if (title) title.textContent = info.title;
    if (copy) copy.textContent = info.copy;
    if (counter) counter.textContent = `${step + 1} / ${stepList().length}`;
    host.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((button) => {
      const active = Number(button.dataset.step) === step;
      button.classList.toggle('is-current', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateModelStep();
  };

  function updateModelStep() {
    if (mode === 'xrf') {
      if (rayPrimary) rayPrimary.visible = step >= 1;
      if (pulse) pulse.visible = step >= 1;
      if (raySecondary) raySecondary.visible = step >= 2;
      if (spectrum) spectrum.visible = step >= 3;
    } else {
      if (flexBar) {
        flexBar.visible = step >= 1;
        flexBar.position.y = Number(flexBar.userData.baseY ?? 0.77) - (step >= 2 ? 0.055 : 0);
      }
      if (signalLines) signalLines.visible = step >= 2;
      if (ring) ring.visible = step >= 1;
    }
  }

  const setMode = (next: DeviceMode) => {
    if (mode === next && model) return;
    mode = next;
    step = 0;
    if (model) {
      scene.remove(model);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    }
    model = null;
    rayPrimary = null;
    raySecondary = null;
    spectrum = null;
    signalLines = null;
    flexBar = null;
    ring = null;
    pulse = null;
    const info = devices[mode];
    host.querySelectorAll<HTMLButtonElement>('[data-device]').forEach((button) => {
      const active = button.dataset.device === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    photo.src = info.photo;
    photo.alt = info.alt;
    const subtitle = host.querySelector<HTMLElement>('[data-device-subtitle]');
    const title = host.querySelector<HTMLElement>('[data-device-title]');
    const caution = host.querySelector<HTMLElement>('[data-device-caution]');
    const label = host.querySelector<HTMLElement>('[data-photo-label]');
    const source = host.querySelector<HTMLAnchorElement>('[data-device-source]');
    if (subtitle) subtitle.textContent = info.subtitle;
    if (title) title.textContent = info.title;
    if (caution) caution.textContent = info.caution;
    if (label) label.textContent = info.photoLabel;
    if (source) source.href = info.sourceUrl;
    host.dataset.mode = mode;
    const buttonWrap = host.querySelector<HTMLElement>('[data-step-buttons]');
    if (buttonWrap) {
      buttonWrap.innerHTML = info.steps.map((item, index) => `<button type="button" data-step="${index}" aria-label="${item.title}" aria-pressed="false"><span>${String(index + 1).padStart(2, '0')}</span><i></i></button>`).join('');
    }
    scene.background = new THREE.Color(mode === 'xrf' ? 0x142b27 : 0x172d2a);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background as THREE.Color);
    if (mode === 'xrf') makeXrfModel(); else makeScaleModel();
    setStep(0);
    if (controls) {
      controls.target.set(0, mode === 'xrf' ? 0.92 : 0.72, 0);
      camera.position.set(4.3, 3.2, 5.7);
      controls.update();
    }
  };

  const animate = () => {
    if (destroyed) return;
    animationFrame = window.requestAnimationFrame(animate);
    if (pulse && pulse.visible) {
      const progress = (Math.sin(performance.now() * 0.0025) + 1) / 2;
      pulse.position.lerpVectors(new THREE.Vector3(-0.88, 1.52, 0.74), new THREE.Vector3(0, 0.98, 0.16), progress);
    }
    if (ring && ring.visible) ring.rotation.y = Math.sin(performance.now() * 0.0008) * 0.08;
    controls?.update();
    renderer?.render(scene, camera);
  };

  const resize = () => {
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  };

  host.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const modeButton = target.closest<HTMLButtonElement>('[data-device]');
    if (modeButton?.dataset.device === 'xrf' || modeButton?.dataset.device === 'scale') setMode(modeButton.dataset.device);
    const stepButton = target.closest<HTMLButtonElement>('[data-step]');
    if (stepButton?.dataset.step) setStep(Number(stepButton.dataset.step));
    if (target.closest('[data-zoom="in"]')) {
      camera.position.multiplyScalar(0.88);
      controls?.update();
    }
    if (target.closest('[data-zoom="out"]')) {
      camera.position.multiplyScalar(1.12);
      controls?.update();
    }
    if (target.closest('[data-reset]') && controls) {
      camera.position.set(4.3, 3.2, 5.7);
      controls.target.set(0, mode === 'xrf' ? 0.92 : 0.72, 0);
      controls.update();
    }
  });

  const initialized = makeScene();
  const initial = devices[mode];
  photo.src = initial.photo;
  photo.alt = initial.alt;
  host.querySelectorAll<HTMLButtonElement>('[data-device]').forEach((button) => {
    const active = button.dataset.device === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  host.querySelector<HTMLElement>('[data-device-subtitle]')!.textContent = initial.subtitle;
  host.querySelector<HTMLElement>('[data-device-title]')!.textContent = initial.title;
  host.querySelector<HTMLElement>('[data-device-caution]')!.textContent = initial.caution;
  host.querySelector<HTMLElement>('[data-photo-label]')!.textContent = initial.photoLabel;
  const source = host.querySelector<HTMLAnchorElement>('[data-device-source]');
  if (source) source.href = initial.sourceUrl;
  const buttonWrap = host.querySelector<HTMLElement>('[data-step-buttons]');
  if (buttonWrap) buttonWrap.innerHTML = initial.steps.map((item, index) => `<button type="button" data-step="${index}" aria-label="${item.title}" aria-pressed="false"><span>${String(index + 1).padStart(2, '0')}</span><i></i></button>`).join('');
  setStep(0);
  if (initialized) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    animate();
  }

  return () => {
    destroyed = true;
    window.cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    controls?.dispose();
    scene?.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    renderer?.dispose();
    host.innerHTML = '';
  };
}
