import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let _logoutScheduled = false

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      if (!_logoutScheduled) {
        _logoutScheduled = true
        setTimeout(() => {
          _logoutScheduled = false
          localStorage.removeItem('token')
          localStorage.removeItem('role')
          localStorage.removeItem('base_role')
          localStorage.removeItem('extra_roles')
          localStorage.removeItem('nombre')
          localStorage.removeItem('participant_id')
          localStorage.removeItem('organizer_enabled')
          localStorage.removeItem('judge_enabled')
          localStorage.removeItem('admin_enabled')
          window.dispatchEvent(new Event('finalrep:session-changed'))
          window.location.href = '/login'
        }, 300)
      }
    }
    return Promise.reject(err)
  }
)

export default api
