import CalendarView from './components/CalendarView';
import ProtectedRoute from '../components/ProtectedRoute';

export default function CalendarPage() {
  return (
    <ProtectedRoute>
      <CalendarView />
    </ProtectedRoute>
  );
}
