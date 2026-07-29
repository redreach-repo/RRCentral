import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { ToastProvider } from './contexts/ToastContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CrmPage from './pages/CrmPage'
import FollowupsPage from './pages/FollowupsPage'
import QuotationsPage from './pages/QuotationsPage'
import InvoicesPage from './pages/InvoicesPage'
import CatalogPage from './pages/CatalogPage'
import TemplatesPage from './pages/TemplatesPage'
import ReportsPage from './pages/ReportsPage'
import ExpensesPage from './pages/ExpensesPage'
import SettingsPage from './pages/SettingsPage'
import DocumentPage from './pages/DocumentPage'

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/document/:type/:id"
              element={
                <ProtectedRoute>
                  <DocumentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="crm" element={<CrmPage />} />
              <Route path="follow-ups" element={<FollowupsPage />} />
              <Route path="quotations" element={<QuotationsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="catalog" element={<CatalogPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}
