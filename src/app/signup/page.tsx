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
import './signup.css';

// Signup form data
interface SignupFormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  createWallet: boolean;
  securityAcknowledged: boolean;
}

// GraphQL mutation for user registration
const REGISTER_MUTATION = `
  mutation Register($username: String!, $email: String, $password: String!) {
    register(username: $username, email: $email, password: $password) {
      token
      user {
        id
        username
        email
      }
    }
  }
`;

// GraphQL mutation for wallet creation
const CREATE_WALLET_MUTATION = `
  mutation CreateWallet($password: String!) {
    createWallet(password: $password) {
      id
      address
      chainId
    }
  }
`;

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<SignupFormData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    createWallet: true,
    securityAcknowledged: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
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

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (!formData.securityAcknowledged) {
      setError('You must acknowledge the security warning to create an account');
      return;
    }

    try {
      setLoading(true);

      // Register user
      const registerResponse = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: REGISTER_MUTATION,
          variables: {
            username: formData.username,
            email: formData.email || null,
            password: formData.password,
          },
        }),
      });

      const registerResult = await registerResponse.json();

      if (registerResult.errors) {
        throw new Error(registerResult.errors[0].message);
      }

      const { token } = registerResult.data.register;

      // Store token in localStorage
      localStorage.setItem('auth_token', token);

      // Create wallet if checkbox is checked
      if (formData.createWallet) {
        const walletResponse = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: CREATE_WALLET_MUTATION,
            variables: {
              password: formData.password,
            },
          }),
        });

        const walletResult = await walletResponse.json();

        if (walletResult.errors) {
          throw new Error(walletResult.errors[0].message);
        }
      }

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      logger.error('Signup error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      {/* Main Content */}
      <main className="flex-grow py-12">
        <div className="container mx-auto px-4">
          <div className="signup-container">
            <h1 className="signup-title">Create your account</h1>
            <p className="signup-subtitle">Join KalySwap and start trading on KalyChain</p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="username" className="form-label">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Choose a username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email" className="form-label">Email (optional)</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                  className="form-input"
                />
                <p className="form-helper">We'll never share your email with anyone else.</p>
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="form-input"
                />
                <p className="form-helper">Password must be at least 8 characters long.</p>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  className="form-input"
                />
              </div>

              <div className="wallet-info">
                <div className="flex items-start gap-3">
                  <input
                    id="createWallet"
                    name="createWallet"
                    type="checkbox"
                    checked={formData.createWallet}
                    onChange={(e) => setFormData(prev => ({ ...prev, createWallet: e.target.checked }))}
                    className="form-checkbox mt-1"
                  />
                  <div>
                    <label htmlFor="createWallet" className="wallet-info-title">
                      Create a KalyChain wallet
                    </label>
                    <p className="wallet-info-text">
                      Your password will be used to encrypt your wallet's private key. This allows you to:
                    </p>
                    <ul className="wallet-info-text mt-2 space-y-1 list-disc list-inside">
                      <li>Access your wallet directly from KalySwap</li>
                      <li>Trade without installing browser extensions</li>
                      <li>Export your wallet if needed</li>
                    </ul>
                    <p className="wallet-info-text mt-2 font-medium">
                      Make sure to use a strong password and keep it safe.
                    </p>
                  </div>
                </div>
              </div>

              {/* Security Warning and Acknowledgment */}
              <div className="wallet-info">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="wallet-info-title mb-2">Important Security Notice</h4>
                    <p className="wallet-info-text mb-3">
                      <strong>We do not offer password recovery</strong> to maintain the highest level of wallet security.
                      If you lose your password, you will permanently lose access to your wallet and funds.
                    </p>
                    <p className="wallet-info-text mb-4">
                      Please save your password in a secure location such as a password manager or write it down and store it safely.
                    </p>
                    <div className="flex items-start gap-3">
                      <input
                        id="securityAcknowledged"
                        name="securityAcknowledged"
                        type="checkbox"
                        checked={formData.securityAcknowledged}
                        onChange={(e) => setFormData(prev => ({ ...prev, securityAcknowledged: e.target.checked }))}
                        className="form-checkbox mt-1"
                        required
                      />
                      <label htmlFor="securityAcknowledged" className="wallet-info-title text-sm font-medium">
                        I understand that password recovery is not available and I am responsible for keeping my password safe
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="submit-button"
                disabled={loading || !formData.securityAcknowledged}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <div className="login-link">
              Already have an account?{' '}
              <Link href="/login">Sign in</Link>
            </div>
          </div>
        </div>
      </main>
    </MainLayout>
  );
}
