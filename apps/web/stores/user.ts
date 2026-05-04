import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserState {
  username: string | null;
  setUsername: (name: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      username: null,
      setUsername: (name) => set({ username: name.trim().slice(0, 24) }),
    }),
    { name: "denpa-user" }
  )
);
