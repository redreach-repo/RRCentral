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
import DeliveryNotesPage from './pages/DeliveryNotesPage'
import CatalogPage from './pages/CatalogPage'
import InventoryPage from './pages/InventoryPage'
import PaymentsPage from './pages/PaymentsPage'
import WandersPage from './pages/WandersPage'
import TemplatesPage from './pages/TemplatesPage'
import ReportsPage from './pages/ReportsPage'
import ExpensesPage from './pages/ExpensesPage'
import VendorsPage from './pages/VendorsPage'
import CustomerFilesPage from './pages/CustomerFilesPage'
import SettingsPage from './pages/SettingsPage'
import AuditLogPage from './pages/AuditLogPage'
import DocumentPage from './pages/DocumentPage'
import ShopLayout from './shop/ShopLayout'
import ShopHomePage from './shop/pages/ShopHomePage'
import ShopListingPage from './shop/pages/ShopListingPage'
import ProductPage from './shop/pages/ProductPage'
import CartPage from './shop/pages/CartPage'
import WishlistPage from './shop/pages/WishlistPage'
import OrderSuccessPage from './shop/pages/OrderSuccessPage'
import OrderCancelPage from './shop/pages/OrderCancelPage'

/**
 * Central is CRM-first. Marketing pages live on www.redreach.ae (WordPress),
 * not inside this SPA. Tee Tribe shop stays available under /shop.
 */
export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route element={<ShopLayout />}>
              <Route path="shop" element={<ShopHomePage />} />
              <Route path="shop/c/:category" element={<ShopListingPage />} />
              <Route path="shop/search" element={<ShopListingPage />} />
              <Route path="shop/sale" element={<ShopListingPage saleOnly />} />
              <Route path="shop/p/:slug" element={<ProductPage />} />
              <Route path="shop/cart" element={<CartPage />} />
              <Route path="shop/wishlist" element={<WishlistPage />} />
              <Route path="shop/order/success" element={<OrderSuccessPage />} />
              <Route path="shop/order/cancel" element={<OrderCancelPage />} />
            </Route>
            <Route path="teetribe" element={<Navigate to="/shop" replace />} />
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
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="app" element={<DashboardPage />} />
              <Route path="app/wanders" element={<WandersPage />} />
              <Route path="crm" element={<CrmPage />} />
              <Route path="follow-ups" element={<FollowupsPage />} />
              <Route path="quotations" element={<QuotationsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="delivery-notes" element={<DeliveryNotesPage />} />
              <Route path="customer-files" element={<CustomerFilesPage />} />
              <Route path="catalog" element={<CatalogPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="vendors" element={<VendorsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="audit-log" element={<AuditLogPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </ToastProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}
