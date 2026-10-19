import React, { createContext, useContext, ReactNode } from 'react';
import { User } from '../types';

// A static mock user is provided to ensure the UI renders correctly without a real auth system.
const mockAdminUser: User = {
  id: 'admin-001',
  username: 'Admin',
  accessLevel: 'Admin',
  profilePicture: 'https://i.ibb.co/6gBSghs/logo-hot-broast.png',
};

interface AuthContextType {
  currentUser: User | null;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// The provider now simply provides a static mock user context. All state management is removed.
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const value = {
    currentUser: mockAdminUser,
    login: () => console.log("Auth system disabled. Login function is a no-op."),
    logout: () => console.log("Auth system disabled. Logout function is a no-op."),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// The hook remains structurally the same for component compatibility.
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
