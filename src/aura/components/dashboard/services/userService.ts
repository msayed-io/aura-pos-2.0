import type { User } from '../../../types';

export const fetchUsers = async (): Promise<User[]> => {
    console.log("User service is offline. Returning empty user list.");
    return [];
};

export const addUser = async (userData: Omit<User, 'id'>): Promise<User> => {
    console.log("User service is offline. Action ignored.");
    // Return a mock object to satisfy type constraints
    return { ...userData, id: `mock_${Date.now()}` };
};

export const updateUser = async (userId: string, updates: Partial<User>): Promise<User | null> => {
    console.log("User service is offline. Action ignored.");
    return null;
};

export const deleteUser = async (userId: string): Promise<boolean> => {
    console.log("User service is offline. Action ignored.");
    return true;
};
