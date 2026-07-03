import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { OrgProvider } from '@/contexts/OrgContext'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import RecipesPage from '@/pages/recipes/RecipesPage'
import MenuPlannerPage from '@/pages/menu/MenuPlannerPage'
import MenuPrintOfficialPage from '@/pages/menu/MenuPrintOfficialPage'
import MenuPublishedPage from '@/pages/menu/MenuPublishedPage'
import MenuCurrentPage from '@/pages/menu/MenuCurrentPage'
import KitchenViewPage from '@/pages/kitchen/KitchenViewPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import PurchasesPage from '@/pages/purchases/PurchasesPage'
import PurchaserApp from '@/pages/PurchaserApp'
import InventoryPage from './pages/inventory/InventoryPage'
import KitchenStockPage from './pages/kitchen-stock/KitchenStockPage'
import CACFPReportsPage from './pages/cacfp-reports/CACFPReportsPage'
import FormSubmissionsPage from './pages/form-submissions/FormSubmissionsPage'
import MealCountPage from '@/pages/meal-count/MealCountPage'
import DocumentsPage from '@/pages/documents/DocumentsPage'
import DispatchPage from '@/pages/dispatch/DispatchPage'
import DeliveryPage from '@/pages/delivery/DeliveryPage'
import CustomExportPage from '@/pages/export/CustomExportPage'
import SiteClaimReport from './pages/reports/SiteClaimReport'
import ReimbursementPreview from './pages/reports/ReimbursementPreview'
import CACFPChecklistPage from './pages/cacfp-reports/CACFPChecklistPage'
import SafePassTeacherPage from './pages/safepass/SafePassTeacherPage'
import SafePassParentPage from './pages/safepass/SafePassParentPage'
import SafePassHelpPage from './pages/safepass/SafePassHelpPage'
import MealCountHelpPage from './pages/meal-count/MealCountHelpPage'
import KitchenPlanningReport from './pages/reports/KitchenPlanningReport'
import ReceiptReviewPage from '@/pages/receipt-review/ReceiptReviewPage'
import UserManagementPage from '@/pages/org/UserManagementPage'
import ConsolidatedReport from '@/pages/org/ConsolidatedReport'
import ChildrenPage from '@/pages/children/ChildrenPage'
import CenterRosterPage from '@/pages/children/CenterRosterPage'
import StaffPage from '@/pages/staff/StaffPage'
import InstructionsPage from '@/pages/instructions/InstructionsPage'
import DocumentHubPage from '@/pages/instructions/DocumentHubPage'
import PoliciesPage from '@/pages/policies/PoliciesPage'
import MessagesPage from '@/pages/messages/MessagesPage'
import BYODDirectorPage from '@/pages/instructions/BYODDirectorPage'
import StaffSettingsPage from '@/pages/staff/StaffSettingsPage'
import DailyTimeLogPage from '@/pages/staff/DailyTimeLogPage'
import ChildrenImportPage from '@/pages/children/ChildrenImportPage'
import ChildrenExportPage from '@/pages/children/ChildrenExportPage'
import PortalPage from '@/pages/portal/PortalPage'

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
        <OrgProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/purchaser-app" element={<PurchaserApp />} />
            <Route path="/safepass/parent" element={<SafePassParentPage />} />
            <Route path="/portal/:role/:center" element={<PortalPage />} />
            <Route path="/portal/:role" element={<PortalPage />} />
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
              <Route path="menu/print-official/:center/:year/:month" element={<MenuPrintOfficialPage />} />
              <Route path="menu/published/:center/:year/:month" element={<MenuPublishedPage />} />
              <Route path="menu/current" element={<MenuCurrentPage />} />
              <Route path="recipes"    element={<RecipesPage />} />
              <Route path="kitchen"       element={<KitchenViewPage />} />
              <Route path="kitchen-stock" element={<KitchenStockPage />} />
              <Route path="delivery"   element={<DeliveryPage />} />
              <Route path="purchases"  element={<PurchasesPage />} />
              <Route path="inventory"  element={<InventoryPage />} />
              <Route path="reports"    element={<CACFPReportsPage />} />
              <Route path="finance"    element={<PlaceholderPage title="Finance Export" />} />
              <Route path="submissions" element={<FormSubmissionsPage />} />
              <Route path="meal-count"  element={<MealCountPage />} />
              <Route path="meal-count-director" element={<Navigate to="/meal-count" replace />} />
              <Route path="documents"   element={<DocumentsPage />} />
              <Route path="dispatch"    element={<DispatchPage />} />
              <Route path="export"      element={<CustomExportPage />} />
              <Route path="claim-report"    element={<SiteClaimReport />} />
              <Route path="reimbursement-preview" element={<ReimbursementPreview />} />
              <Route path="cacfp-checklist" element={<CACFPChecklistPage />} />
              <Route path="safepass/teacher" element={<SafePassTeacherPage />} />
              <Route path="safepass/help" element={<SafePassHelpPage />} />
              <Route path="meal-count/help" element={<MealCountHelpPage />} />
              <Route path="kitchen-report"      element={<KitchenPlanningReport />} />
              <Route path="receipt-review"     element={<ReceiptReviewPage />} />
              <Route path="children"           element={<ChildrenPage />} />
              <Route path="center/:centerId"   element={<CenterRosterPage />} />
              <Route path="staff"              element={<StaffPage />} />
              <Route path="staff/:staffId/settings" element={<StaffSettingsPage />} />
              <Route path="staff/time-log"    element={<DailyTimeLogPage />} />
              <Route path="children/import"    element={<ChildrenImportPage />} />
              <Route path="children/export"    element={<ChildrenExportPage />} />
              <Route path="org/users"  element={<UserManagementPage />} />
              <Route path="org/consolidated-report" element={<ConsolidatedReport />} />
              <Route path="settings"   element={<SettingsPage />} />
              <Route path="instructions" element={<InstructionsPage />} />
              <Route path="document-hub" element={<DocumentHubPage />} />
              <Route path="policies" element={<PoliciesPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="byod-director" element={<BYODDirectorPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        </OrgProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

