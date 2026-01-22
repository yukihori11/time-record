import TimerApp from './timer/components/TimerApp';
import ProtectedRoute from './components/ProtectedRoute';

export default function Home() {
  return (
    <ProtectedRoute>
      <TimerApp />
    </ProtectedRoute>
  );
}
