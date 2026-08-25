import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SignInScreen from '@/components/SignInScreen';

const signinRedirect = vi.fn();
vi.mock('react-oidc-context', () => ({
  useAuth: () => ({ signinRedirect }),
}));

describe('SignInScreen', () => {
  it('starts the redirect when asked', async () => {
    const user = userEvent.setup();
    render(<SignInScreen />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(signinRedirect).toHaveBeenCalled();
  });

  it('replaces the button with the reason when access was refused', () => {
    // Offering "sign in" to someone already signed in but not permitted would
    // loop them through Cognito for nothing.
    render(<SignInScreen denied="Not a member of the lightning group" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/lightning group/);
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });
});
