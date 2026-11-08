let worker;
let requestId = 0;
let runtimePromise;
const requests = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./kokoroSpeech.worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    const request = requests.get(data.id);
    if (!request) return;
    if (data.type === "progress") {
      request.onProgress(data.message);
      return;
    }
    requests.delete(data.id);
    if (data.type === "error") request.reject(new Error(data.message));
    else if (data.type === "samples")
      request.resolve({
        samples: new Float32Array(data.samples),
        sampleRate: data.sampleRate,
      });
    else request.resolve();
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Local speech worker failed.");
    for (const request of requests.values()) request.reject(error);
    requests.clear();
    worker.terminate();
    worker = undefined;
    runtimePromise = undefined;
  };
  return worker;
}

function request(type, text, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    requests.set(id, { resolve, reject, onProgress });
    try {
      getWorker().postMessage({ id, type, text, baseUrl: document.baseURI });
    } catch (error) {
      requests.delete(id);
      reject(error);
    }
  });
}

export function preloadSpeech(onProgress = () => {}) {
  runtimePromise ??= request("preload", "", onProgress).catch((error) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}

export async function synthesizeSpeech(text, onProgress = () => {}) {
  await preloadSpeech(onProgress);
  return request("synthesize", text, onProgress);
}
