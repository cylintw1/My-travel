/**
 * mytravel Worker - 同時做兩件事：
 *   1. /api/order 開頭的請求 → 家庭點餐清單 API（存在 KV 裡）
 *   2. 其他所有請求 → 交給 assets（也就是 index.html 等靜態檔案）處理，
 *      這樣你原本的行程網頁不會受影響。
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const KV_KEY = "order_state";
const RESTAURANTS = ["innout", "panda", "toadstool"];

function emptyState() {
  return { innout: [], panda: [], toadstool: [] };
}

async function getState(env) {
  const raw = await env.ORDERS.get(KV_KEY);
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    return { ...emptyState(), ...parsed };
  } catch (err) {
    return emptyState();
  }
}

async function saveState(env, state) {
  await env.ORDERS.put(KV_KEY, JSON.stringify(state));
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

async function handleOrderApi(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    const state = await getState(env);
    return jsonResponse(state);
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { action, restaurant } = body;

    if (!RESTAURANTS.includes(restaurant)) {
      return jsonResponse({ error: "Unknown restaurant: " + restaurant }, 400);
    }

    const state = await getState(env);

    if (action === "add") {
      const { person, item, qty, note } = body;
      if (!person || !item) {
        return jsonResponse({ error: "Missing person or item" }, 400);
      }
      state[restaurant].push({
        id: crypto.randomUUID(),
        person: String(person).slice(0, 40),
        item: String(item).slice(0, 100),
        qty: Math.max(1, Math.min(20, parseInt(qty, 10) || 1)),
        note: String(note || "").slice(0, 120),
        ts: Date.now(),
      });
    } else if (action === "remove") {
      const { id } = body;
      state[restaurant] = state[restaurant].filter((entry) => entry.id !== id);
    } else if (action === "clear") {
      state[restaurant] = [];
    } else {
      return jsonResponse({ error: "Unknown action: " + action }, 400);
    }

    await saveState(env, state);
    return jsonResponse(state);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/order") {
      return handleOrderApi(request, env);
    }

    // 不是 API 的請求，交給靜態檔案（index.html 等）處理
    return env.ASSETS.fetch(request);
  },
};
