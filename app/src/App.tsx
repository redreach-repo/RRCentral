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
import InventoryPage from './pages/InventoryPage'
import PaymentsPage from './pages/PaymentsPage'
import WandersPage from './pages/WandersPage'
import TemplatesPage from './pages/TemplatesPage'
import ReportsPage from './pages/ReportsPage'
import ExpensesPage from './pages/ExpensesPage'
import SettingsPage from './pages/SettingsPage'
import DocumentPage from './pages/DocumentPage'
import SiteLayout from './site/components/SiteLayout'
import HomePage from './site/pages/HomePage'
import AboutPage from './site/pages/AboutPage'
import ContactPage from './site/pages/ContactPage'
import VerticalPage, { VerticalAliasRedirect } from './site/pages/VerticalPage'
import VerticalsIndexPage from './site/pages/VerticalsIndexPage'
import InsightsPage from './site/pages/InsightsPage'
import WandersExplorePage from './site/pages/WandersExplorePage'
import WandersRegionPage from './site/pages/WandersRegionPage'
import { PLAYBOOKS } from './site/data/playbooks'
import ShopLayout from './shop/ShopLayout'
import ShopHomePage from './shop/pages/ShopHomePage'
import ShopListingPage from './shop/pages/ShopListingPage'
import ProductPage from './shop/pages/ProductPage'
import CartPage from './shop/pages/CartPage'
import WishlistPage from './shop/pages/WishlistPage'
import OrderSuccessPage from './shop/pages/OrderSuccessPage'
import OrderCancelPage from './shop/pages/OrderCancelPage'

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ToastProvider>
          <Routes>
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
            <Route element={<SiteLayout />}>
              <Route index element={<HomePage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="insights" element={<InsightsPage />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="businesses" element={<VerticalsIndexPage />} />
              <Route path="verticals" element={<Navigate to="/businesses" replace />} />
              <Route path="verticals/:slug" element={<VerticalAliasRedirect />} />
              <Route path="travel" element={<Navigate to="/wanders" replace />} />
              <Route path="uniforms" element={<Navigate to="/threads" replace />} />
              <Route path="wanders" element={<WandersExplorePage />} />
              <Route path="wanders/:region" element={<WandersRegionPage />} />
              {Object.values(PLAYBOOKS)
                .filter((playbook) => playbook.layout !== 'travel')
                .map((playbook) => (
                  <Route key={playbook.path} path={playbook.path.slice(1)} element={<VerticalPage />} />
                ))}
            </Route>
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
              <Route path="crm" element={<CrmPage />} />
              <Route path="follow-ups" element={<FollowupsPage />} />
              <Route path="quotations" element={<QuotationsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="catalog" element={<CatalogPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="wanders" element={<WandersPage />} />
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
