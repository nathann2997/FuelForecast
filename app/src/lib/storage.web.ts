// Browser preview: localStorage with the same subset of the kv-store API the app uses.
const ls = () => (typeof localStorage === 'undefined' ? null : localStorage);

const Storage = {
  getItemSync: (k: string) => ls()?.getItem(k) ?? null,
  setItemSync: (k: string, v: string) => ls()?.setItem(k, v),
  getItem: async (k: string) => ls()?.getItem(k) ?? null,
  setItem: async (k: string, v: string) => ls()?.setItem(k, v),
  removeItem: async (k: string) => ls()?.removeItem(k),
};

export default Storage;
