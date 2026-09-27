'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiException, getToken, setSession } from '@/lib/api';
import { login } from '@/lib/endpoints';
import { useToast } from '@/components/ui/toast';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});

  useEffect(() => {
    if (getToken()) router.replace('/');
  }, [router]);

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setSession(data.access_token, data.user);
      toast('success', 'Login berhasil.');
      router.replace('/');
    },
    onError: (error) => {
      toast('error', error instanceof ApiException ? error.message : 'Login gagal.');
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (username.trim().length < 3) next.username = 'Minimal 3 karakter.';
    if (password.length < 6) next.password = 'Minimal 6 karakter.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate({ username: username.trim(), password });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="card w-full max-w-sm p-5"
        aria-label="Form login"
      >
        <h1 className="text-lg font-semibold">Masuk ke Dashboard</h1>
        <p className="mt-1 text-[#475569]">
          Gunakan akun staf yang diberikan administrator.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium">Username</span>
          <input
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            aria-invalid={Boolean(errors.username)}
          />
          {errors.username ? <span className="field-error">{errors.username}</span> : null}
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
          />
          {errors.password ? <span className="field-error">{errors.password}</span> : null}
        </label>

        <button
          type="submit"
          className="btn btn-primary mt-5 w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Memproses…' : 'Masuk'}
        </button>
      </form>
    </main>
  );
}
