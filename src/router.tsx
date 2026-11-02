import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router'
import { AppShell } from './components/AppShell'
import { AuthGate } from './components/AuthGate'
import { AddPage } from './pages/AddPage'
import { DiaryPage } from './pages/DiaryPage'
import { EntryDetailPage } from './pages/EntryDetailPage'
import { EntryFormPage } from './pages/EntryFormPage'
import { FoodFormPage } from './pages/FoodFormPage'
import { FoodsPage } from './pages/FoodsPage'
import { HomePage } from './pages/HomePage'
import { MealFormPage } from './pages/MealFormPage'
import { MealsPage } from './pages/MealsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SettingsPage } from './pages/SettingsPage'

const ReportPage = lazy(() => import('./pages/ReportPage'))
const SharingPage = lazy(() => import('./pages/SharingPage'))
const SharedReportPage = lazy(() => import('./pages/SharedReportPage'))

const form = { hideNav: true }

export const router = createBrowserRouter([
  // Public, read-only page for recipients of a share link – no app chrome, no local data.
  {
    path: '/shared',
    element: (
      <Suspense fallback={null}>
        <SharedReportPage />
      </Suspense>
    ),
  },
  {
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'diary', element: <DiaryPage /> },
      { path: 'add', element: <AddPage />, handle: form },
      { path: 'entry/new', element: <EntryFormPage />, handle: form },
      { path: 'entry/:id', element: <EntryDetailPage /> },
      { path: 'entry/:id/edit', element: <EntryFormPage />, handle: form },
      { path: 'foods', element: <FoodsPage /> },
      { path: 'foods/new', element: <FoodFormPage />, handle: form },
      { path: 'foods/:id', element: <FoodFormPage />, handle: form },
      { path: 'meals', element: <MealsPage /> },
      { path: 'meals/new', element: <MealFormPage />, handle: form },
      { path: 'meals/:id', element: <MealFormPage />, handle: form },
      { path: 'report', element: <ReportPage />, handle: { wide: true } },
      { path: 'sharing', element: <SharingPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
