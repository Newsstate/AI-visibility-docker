import axios from 'axios';

const api = axios.create({ 
  baseURL: import.meta.env.VITE_API_URL 
    ? `${import.meta.env.VITE_API_URL}/api` 
    : '/api'
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const auth = {
  register: (d) => api.post('/auth/register', d),
  login: (d) => api.post('/auth/login', d),
  me: () => api.get('/auth/me'),
};

export const projects = {
  list: () => api.get('/projects'),
  get: (id) => api.get(`/projects/${id}`),
  create: (d) => api.post('/projects', d),
  recheck: (id) => api.post(`/projects/${id}/check`),
  addPrompts: (id, prompts) => api.post(`/projects/${id}/prompts`, { prompts }),
};

export const reports = {
  get: (projectId) => api.get(`/reports/project/${projectId}`),
  getRunStatus: (runId) => api.get(`/reports/runs/${runId}`),
};

export default api;
