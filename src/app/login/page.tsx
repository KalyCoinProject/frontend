'use client';

import { logger } from '@/lib/logger';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

// Login form data
interface LoginFormData {
  username: string;
  password: string;
}

// GraphQL mutation for user login
const LOGIN_MUTATION = `
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      token
      user {
        id
        username
        email
      }
    }
  }
`;

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate form
    if (!formData.username || !formData.password) {
      setError('Username and password are required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Import auth utilities dynamically
      const { fetchGraphQLWithAuth, setAuthToken, parseAuthError } = await import('@/utils/auth');

      // Login user using enhanced GraphQL fetch
      const result = await fetchGraphQLWithAuth(LOGIN_MUTATION, {
        username: formData.username,
        password: formData.password,
      });

      const { token } = result.data.login;

      // Store token using auth utility
      setAuthToken(token);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      logger.error('Login error:', err);

      // Parse error using auth utilities
      import('@/utils/auth').then(({ parseAuthError }) => {
        const authError = parseAuthError(err);
        setError(authError.message);
      }).catch(() => {
        setError(err instanceof Error ? err.message : 'Login failed');
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      {/* Main Content */}
      <main className="flex-grow py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto">
            <Card className="shadow-md">
              <CardContent className="pt-6">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome back</h1>
                  <p className="text-slate-600">Sign in to your KalySwap account</p>
                </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="username" className="text-sm font-medium text-slate-700 block mb-1.5">
                      Username
                    </Label>
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      placeholder="Enter your username"
                      value={formData.username}
                      onChange={handleChange}
                      required
                      className="h-11 w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5">
                      <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                        Password
                      </Label>
                    </div>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      className="h-11 w-full"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remember"
                      className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Label htmlFor="remember" className="text-sm font-medium text-slate-700">
                      Remember me
                    </Label>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-white font-medium border border-amber-500/30 backdrop-blur-sm shadow-lg transition-all duration-200"
                  style={{
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.8) 0%, rgba(217, 119, 6, 0.8) 100%)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.8) 0%, rgba(217, 119, 6, 0.8) 100%)';
                  }}
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>



              <CardFooter className="flex justify-center border-t mt-8 pt-6">
                <p style={{ color: '#fef3c7' }}>
                  Don't have an account?{' '}
                  <Link href="/signup" className="font-medium" style={{ color: '#f59e0b' }}>
                    Sign up
                  </Link>
                </p>
              </CardFooter>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </MainLayout>
  );
}
