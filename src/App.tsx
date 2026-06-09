import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import RecipesPage from '@/pages/recipes/RecipesPage'
import MenuPlannerPage from '@/pages/menu/MenuPlannerPage'
import KitchenViewPage from '@/pages/kitchen/KitchenViewPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import PurchasesPage from '@/pages/purchases/PurchasesPage'
import PurchaserApp from '@/pages/PurchaserApp'

// Lazy placeholders for other pages
const PlaceholderPage = ({ title }: { title: string }) => (
  <div style={{
    padding: 40,
    fontFamily: "'DM Sans', sans-serif",
  }}>
    <div style={{
      fontSize: 24,
      fontWeight: 600,
      color: '#0f4c35',
      marginBottom: 8,
    }}>
      {title}
    </div>
    <div style={{ color: '#888', fontSize: 14 }}>
      Coming soon — under development
    </div>
  </div>
)

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f4c35',
        fontFamily: "'DM Sans', sans-serif",
        color: '#7ee8b0',
        fontSize: 14,
      }}>
        Loading...
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/purchaser-app" element={<PurchaserApp />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"  element={<DashboardPage />} />
              <Route path="menu"       element={<MenuPlannerPage />} />
              <Route path="recipes"    element={<RecipesPage />} />
              <Route path="kitchen"    element={<KitchenViewPage />} />
              <Route path="delivery"   element={<PlaceholderPage title="Delivery Routes" />} />
              <Route path="purchases"  element={<PurchasesPage />} />
              <Route path="inventory"  element={<PlaceholderPage title="Inventory" />} />
              <Route path="reports"    element={<PlaceholderPage title="CACFP Reports" />} />
              <Route path="finance"    element={<PlaceholderPage title="Finance Export" />} />
              <Route path="settings"   element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
