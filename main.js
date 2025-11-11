import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// Configuration
const MODEL_SCALE = 0.4;
const MODEL_POSITION = { x: 0, y: -0.2, z: 0 };
let THRESHOLD = 0.9;
const rotationAmount = 0.2;
const LERP_FACTOR = 0.05;

// Are.na API configuration
const ARENA_API_URLS = [
  "https://api.are.na/v2/channels/clouds-iizyl5tlx-m/contents",
  // "https://api.are.na/v2/channels/sky-j5969vufbq8/contents",
];

// Global state
let selectedMaskImageURL = null;
let selectedBackgroundImageURL = null;
let arenaImageCache = [];
let isAnimatingImages = false;
let imageAnimationInterval = null;
let currentScene = null;
let currentRenderer = null;
let currentCamera = null;
let currentThresholdMaterial = null;
let currentModel = null;
let currentLoader = null;

// Asset arrays
const AVAILABLE_MODELS = [];
for (let i = 0; i <= 31; i++) {
  AVAILABLE_MODELS.push(`${i}.glb`);
}

const AVAILABLE_IMAGES = [];
for (let i = 0; i <= 93; i++) {
  AVAILABLE_IMAGES.push(`${i}.jpg`);
}

// Utility functions
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Are.na API functions
async function fetchArenaImages() {
  let allImageURLs = [];

  for (const apiURL of ARENA_API_URLS) {
    try {
      const response = await fetch(apiURL);
      const data = await response.json();
      const imageBlocks = data.contents.filter(
        (block) => block.class === "Image"
      );
      const imageURLs = imageBlocks.map((block) => block.image.display.url);
      allImageURLs = allImageURLs.concat(imageURLs);
    } catch (err) {
      console.error("Error fetching Are.na data from", apiURL, err);
    }
  }

  return allImageURLs;
}

function getTwoDifferentImageURLs(imageURLs) {
  const firstImage = getRandomItem(imageURLs);
  let secondImage;

  do {
    secondImage = getRandomItem(imageURLs);
  } while (secondImage === firstImage && imageURLs.length > 1);

  return { first: firstImage, second: secondImage };
}

// App initialization
async function initializeApp() {
  console.log("Fetching images from Are.na...");

  try {
    const arenaImageURLs = await fetchArenaImages();

    if (arenaImageURLs.length === 0) {
      console.error(
        "No images found from Are.na channels, falling back to local images"
      );
      const { first: maskImage, second: backgroundImage } =
        getTwoDifferentImages();
      selectedMaskImageURL = `assets/images/${maskImage}`;
      selectedBackgroundImageURL = `assets/images/${backgroundImage}`;
    } else {
      console.log(`Found ${arenaImageURLs.length} images from Are.na`);
      arenaImageCache = arenaImageURLs;

      const { first: maskImageURL, second: backgroundImageURL } =
        getTwoDifferentImageURLs(arenaImageURLs);

      selectedMaskImageURL = maskImageURL;
      selectedBackgroundImageURL = backgroundImageURL;
    }

    console.log(`Loading random mask image: ${selectedMaskImageURL}`);
    console.log(
      `Loading random background image: ${selectedBackgroundImageURL}`
    );

    initializeScene();
  } catch (error) {
    console.error("Error initializing app:", error);
    const { first: maskImage, second: backgroundImage } =
      getTwoDifferentImages();
    selectedMaskImageURL = `assets/images/${maskImage}`;
    selectedBackgroundImageURL = `assets/images/${backgroundImage}`;
    initializeScene();
  }
}

function getTwoDifferentImages() {
  const firstImage = getRandomItem(AVAILABLE_IMAGES);
  let secondImage;

  do {
    secondImage = getRandomItem(AVAILABLE_IMAGES);
  } while (secondImage === firstImage && AVAILABLE_IMAGES.length > 1);

  return { first: firstImage, second: secondImage };
}

// Three.js scene setup
function initializeScene() {
  let previousModel = null;
  const selectedModel = getRandomItem(AVAILABLE_MODELS);
  previousModel = selectedModel;
  console.log(`Loading random model: ${selectedModel}`);
  console.log(
    "Controls: Arrow keys to rotate, +/- to zoom, 'r' to reload model, 'x' to toggle image animation"
  );

  // Set background image with color fallback
  const img = new window.Image();
  img.src = selectedBackgroundImageURL;
  img.onload = function () {
    document.body.style.background = `url('${selectedBackgroundImageURL}') no-repeat center center fixed`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundColor = "";
  };
  // In case image is cached and loads instantly
  if (img.complete) {
    img.onload();
  }

  // Scene, camera, renderer
  const scene = new THREE.Scene();
  currentScene = scene;

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 2;
  currentCamera = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  currentRenderer = renderer;

  // Lighting
  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
  directionalLight.position.set(1, 1, 1);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
  scene.add(ambientLight);

  const lightDirection = new THREE.Vector3(0, 0, 1).normalize();

  // Mouse tracking for model rotation
  const mouse = new THREE.Vector2();
  const targetRotation = new THREE.Vector2(0, 0);
  const currentRotation = new THREE.Vector2(0, 0);

  function updateMousePosition(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    targetRotation.x = -mouse.y * rotationAmount;
    targetRotation.y = mouse.x * rotationAmount;
  }

  window.addEventListener("mousemove", updateMousePosition);

  // Texture loading
  const textureLoader = new THREE.TextureLoader();
  let thresholdMaterial;

  console.log("Loading mask texture from:", selectedMaskImageURL);

  const maskTexture = textureLoader.load(
    selectedMaskImageURL,
    function (texture) {
      console.log("Mask texture loaded successfully");
      const imageAspect = texture.image.width / texture.image.height;
      thresholdMaterial.uniforms.imageAspect.value = imageAspect;
    },
    function (progress) {
      console.log("Texture loading progress:", progress);
    },
    function (error) {
      console.error("Error loading mask texture:", error);
      console.log("Falling back to a solid color texture");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 1, 1);
      maskTexture.image = canvas;
      maskTexture.needsUpdate = true;
    }
  );

  // Shader material
  thresholdMaterial = new THREE.ShaderMaterial({
    uniforms: {
      lightDirection: { value: lightDirection },
      threshold: { value: THRESHOLD },
      maskTexture: { value: maskTexture },
      screenAspect: { value: window.innerWidth / window.innerHeight },
      imageAspect: { value: 1.0 },
    },
    vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vScreenUv;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      
      // Calculate screen space UV coordinates
      vec4 screenPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vScreenUv = (screenPos.xy / screenPos.w) * 0.5 + 0.5;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    uniform vec3 lightDirection;
    uniform float threshold;
    uniform sampler2D maskTexture;
    uniform float screenAspect;
    uniform float imageAspect;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vScreenUv;
    
    void main() {
      vec3 normal = normalize(vNormal);
      float intensity = dot(normal, lightDirection);
      
      float mask = step(threshold, intensity);
      
      // Discard pixels that should be transparent
      if (mask < 0.5) {
        discard;
      }
      
      // Cover-style UV coordinates
      vec2 uv = vScreenUv;
      
      float screenRatio = screenAspect;
      float imageRatio = imageAspect;
      
      if (screenRatio > imageRatio) {
        float scale = screenRatio / imageRatio;
        uv.y = (uv.y - 0.5) / scale + 0.5;
      } else {
        float scale = imageRatio / screenRatio;
        uv.x = (uv.x - 0.5) / scale + 0.5;
      }
      
      vec3 maskColor = texture2D(maskTexture, uv).rgb;
      vec3 finalColor = maskColor;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
    transparent: false,
    alphaTest: 0.0,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
  });
  currentThresholdMaterial = thresholdMaterial;

  // --- Lerp threshold on page load ---
  const initialThreshold = THRESHOLD;
  THRESHOLD = 1;
  thresholdMaterial.uniforms.threshold.value = THRESHOLD;
  function lerpThresholdOnLoad(target, speed = 0.05) {
    function step() {
      THRESHOLD += (target - THRESHOLD) * speed;
      thresholdMaterial.uniforms.threshold.value = THRESHOLD;
      if (Math.abs(THRESHOLD - target) < 0.005) {
        THRESHOLD = target;
        thresholdMaterial.uniforms.threshold.value = THRESHOLD;
      } else {
        requestAnimationFrame(step);
      }
    }
    step();
  }
  lerpThresholdOnLoad(initialThreshold);

  // Event handlers
  function updateThreshold(event) {
    event.preventDefault();
    const scrollSensitivity = 0.008;
    const delta = event.deltaY > 0 ? scrollSensitivity : -scrollSensitivity;
    THRESHOLD = Math.max(0.0, Math.min(0.99, THRESHOLD + delta));
    thresholdMaterial.uniforms.threshold.value = THRESHOLD;
    console.log(`Threshold: ${THRESHOLD.toFixed(2)}`);
  }

  window.addEventListener("wheel", updateThreshold);

  // Arrow key rotation amount
  const arrowKeyRotationSpeed = 0.1;

  // Keypress controls
  window.addEventListener("keydown", function (event) {
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        if (currentModel) {
          // Update the target rotation for smooth interpolation
          targetRotation.x -= arrowKeyRotationSpeed;
        }
        break;

      case "ArrowDown":
        event.preventDefault();
        if (currentModel) {
          // Update the target rotation for smooth interpolation
          targetRotation.x += arrowKeyRotationSpeed;
        }
        break;

      case "ArrowLeft":
        event.preventDefault();
        if (currentModel) {
          // Update the target rotation for smooth interpolation
          targetRotation.y -= arrowKeyRotationSpeed;
        }
        break;

      case "ArrowRight":
        event.preventDefault();
        if (currentModel) {
          // Update the target rotation for smooth interpolation
          targetRotation.y += arrowKeyRotationSpeed;
        }
        break;

      case "+":
      case "=": // Handle both + and = keys (since + requires shift)
        event.preventDefault();
        if (currentCamera) {
          // Zoom in by moving camera closer
          currentCamera.position.z = Math.max(
            0.5,
            currentCamera.position.z - 0.1
          );
          console.log(
            `Zoomed in - Camera Z: ${currentCamera.position.z.toFixed(2)}`
          );
        }
        break;

      case "-":
      case "_": // Handle both - and _ keys
        event.preventDefault();
        if (currentCamera) {
          // Zoom out by moving camera further
          currentCamera.position.z = Math.min(
            10,
            currentCamera.position.z + 0.1
          );
          console.log(
            `Zoomed out - Camera Z: ${currentCamera.position.z.toFixed(2)}`
          );
        }
        break;

      case "x": // Toggle rapid image animation
        if (isAnimatingImages) {
          clearInterval(imageAnimationInterval);
          isAnimatingImages = false;
          console.log("Image animation stopped");
        } else {
          if (arenaImageCache.length > 0) {
            isAnimatingImages = true;
            console.log("Image animation started");
            imageAnimationInterval = setInterval(() => {
              const { first: newMaskURL, second: newBackgroundURL } =
                getTwoDifferentImageURLs(arenaImageCache);

              selectedMaskImageURL = newMaskURL;
              selectedBackgroundImageURL = newBackgroundURL;

              document.body.style.background = `url('${selectedBackgroundImageURL}') no-repeat center center fixed`;
              document.body.style.backgroundSize = "cover";

              const newMaskTexture = new THREE.TextureLoader().load(
                selectedMaskImageURL,
                function (texture) {
                  const imageAspect =
                    texture.image.width / texture.image.height;
                  currentThresholdMaterial.uniforms.imageAspect.value =
                    imageAspect;
                }
              );
              currentThresholdMaterial.uniforms.maskTexture.value =
                newMaskTexture;

              console.log("Images reloaded");
            }, 50);
          } else {
            console.log("No arena images available for animation");
          }
        }
        break;

      case "r": // Reload model
        if (currentModel && currentScene) {
          currentScene.remove(currentModel);
          // Pick a new model that is not the same as the previous one
          let newSelectedModel;
          do {
            newSelectedModel = getRandomItem(AVAILABLE_MODELS);
          } while (
            newSelectedModel === previousModel &&
            AVAILABLE_MODELS.length > 1
          );
          previousModel = newSelectedModel;
          console.log(`Loading new model: ${newSelectedModel}`);

          // Save the current threshold
          const prevThreshold = THRESHOLD;
          const lerpSpeed = 0.05;

          // Helper to lerp threshold to a target value
          function lerpThreshold(target, onComplete) {
            function step() {
              THRESHOLD += (target - THRESHOLD) * lerpSpeed;
              if (currentThresholdMaterial) {
                currentThresholdMaterial.uniforms.threshold.value = THRESHOLD;
              }
              if (Math.abs(THRESHOLD - target) < 0.005) {
                THRESHOLD = target;
                if (currentThresholdMaterial) {
                  currentThresholdMaterial.uniforms.threshold.value = THRESHOLD;
                }
                if (onComplete) onComplete();
              } else {
                requestAnimationFrame(step);
              }
            }
            step();
          }

          // Lerp up to 1, then load model, then lerp back
          lerpThreshold(1, () => {
            currentLoader.load(
              `assets/models/${newSelectedModel}`,
              function (gltf) {
                console.log("New model loaded successfully");
                currentModel = gltf.scene;
                model = gltf.scene; // Also update the model variable used in animation loop

                currentModel.traverse(function (child) {
                  if (child.isMesh) {
                    if (child.geometry) {
                      child.geometry.computeVertexNormals();
                    }
                    child.material = currentThresholdMaterial;
                  }
                });

                currentScene.add(currentModel);
                console.log("New model added to scene");

                currentModel.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
                currentModel.position.set(
                  MODEL_POSITION.x,
                  MODEL_POSITION.y,
                  MODEL_POSITION.z
                );

                // Reset rotation state
                targetRotation.set(0, 0);
                currentRotation.set(0, 0);

                // Lerp back to previous threshold
                lerpThreshold(prevThreshold);
              },
              function (progress) {
                console.log(
                  "Loading progress:",
                  (progress.loaded / progress.total) * 100 + "%"
                );
              },
              function (error) {
                console.error("Error loading new GLB model:", error);
              }
            );
          });
        }
        break;
    }
  });

  // Model loading
  const loader = new GLTFLoader();

  // Set up DRACOLoader for compressed models
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
  );
  loader.setDRACOLoader(dracoLoader);

  currentLoader = loader;
  let model = null;

  console.log("Loading model from:", `assets/models/${selectedModel}`);

  loader.load(
    `assets/models/${selectedModel}`,
    function (gltf) {
      console.log("Model loaded successfully");
      model = gltf.scene;

      model.traverse(function (child) {
        if (child.isMesh) {
          console.log("Applying material to mesh:", child.name);
          if (child.geometry) {
            child.geometry.computeVertexNormals();
          }
          child.material = thresholdMaterial;
        }
      });

      scene.add(model);
      currentModel = model;
      console.log("Model added to scene");

      model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
      model.position.set(MODEL_POSITION.x, MODEL_POSITION.y, MODEL_POSITION.z);
    },
    function (progress) {
      console.log(
        "Loading progress:",
        (progress.loaded / progress.total) * 100 + "%"
      );
    },
    function (error) {
      console.error("Error loading GLB model:", error);
    }
  );

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    thresholdMaterial.uniforms.lightDirection.value.copy(lightDirection);

    // Mouse-based model rotation with smooth interpolation
    if (model) {
      const lerpFactor = 0.05;
      currentRotation.x += (targetRotation.x - currentRotation.x) * lerpFactor;
      currentRotation.y += (targetRotation.y - currentRotation.y) * lerpFactor;

      // Apply both mouse and arrow key rotations
      model.rotation.x = currentRotation.x;
      model.rotation.y = currentRotation.y;
    }

    renderer.render(scene, camera);
  }

  animate();

  // Window resize handler
  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    thresholdMaterial.uniforms.screenAspect.value =
      window.innerWidth / window.innerHeight;
    thresholdMaterial.needsUpdate = true;
  });
}

initializeApp();
