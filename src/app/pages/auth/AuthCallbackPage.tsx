import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { completeTokenLogin } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    const finishAuth = async () => {
      if (hasProcessed.current) return;
      hasProcessed.current = true;

      const error = params.get('error');
      const token = params.get('token');

      if (error || !token) {
        toast.error('Authentication failed. Please try again.');
        navigate('/login', { replace: true });
        return;
      }

      const result = await completeTokenLogin(token);
      if (!result.success) {
        toast.error(result.error || 'Authentication failed.');
        navigate('/login', { replace: true });
        return;
      }

      toast.success('Signed in successfully.');
      navigate(result.role === 'admin' ? '/admin/dashboard' : '/user/dashboard', { replace: true });
    };

    finishAuth();
  }, [completeTokenLogin, navigate, params]);

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-hidden flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #06142B 0%, #0d2563 55%, #06142B 100%)' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-blue-700 animate-spin" />
        <span className="text-sm text-gray-700" style={{ fontWeight: 600 }}>Completing sign in...</span>
      </div>
    </div>
  );
}
