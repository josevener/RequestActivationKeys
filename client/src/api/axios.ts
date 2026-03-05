import axios from "axios";

type UnauthorizedHandler = (message?: string) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
const apiBaseUrl = (env.VITE_API_BASE_URL || env.REACT_APP_API_BASE_URL || "").trim();

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler;
};

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || "");
    const isLoginRequest = requestUrl.includes("/api/auth/login");

    if (status === 401 && !isLoginRequest) {
      unauthorizedHandler?.(error?.response?.data?.message);
    }

    return Promise.reject(error);
  }
);

export default api;
