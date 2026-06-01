const BASE = '/api'

class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'include' }

  if (form) {
    opts.body = form // FormData — let the browser set the multipart boundary
  } else if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  }

  const res = await fetch(`${BASE}${path}`, opts)
  let data = null
  try { data = await res.json() } catch { /* no body */ }

  if (!res.ok) {
    const code = data?.error
    throw new ApiError(code || `Request failed (${res.status})`, res.status, code)
  }
  return data
}

export const api = {
  ApiError,

  // Auth
  me: () => request('/me'),
  login: (password) => request('/login', { method: 'POST', body: { password } }),
  logout: () => request('/logout', { method: 'POST' }),

  // Categories
  listCategories: () => request('/categories'),
  createCategory: (name) => request('/categories', { method: 'POST', body: { name } }),
  renameCategory: (id, name) => request(`/categories/${id}`, { method: 'PUT', body: { name } }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  // Expenses
  listExpenses: (categoryId) =>
    request(`/expenses${categoryId ? `?category_id=${categoryId}` : ''}`),
  getTotals: (categoryId) =>
    request(`/expenses/totals${categoryId ? `?category_id=${categoryId}` : ''}`),
  createExpense: (form) => request('/expenses', { method: 'POST', form }),
  updateExpense: (id, form) => request(`/expenses/${id}`, { method: 'POST', form }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),

  // Todos
  listTodos: (status) => request(`/todos${status ? `?status=${status}` : ''}`),
  createTodo: (todo) => request('/todos', { method: 'POST', body: todo }),
  updateTodo: (id, fields) => request(`/todos/${id}`, { method: 'PUT', body: fields }),
  deleteTodo: (id) => request(`/todos/${id}`, { method: 'DELETE' }),

  // Drive
  driveStatus: () => request('/drive/status'),
}
