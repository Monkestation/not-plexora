export {};

declare global {
	interface Array<T> {
		someAsync(callback: (value: T, index: number, array: T[]) => boolean | Promise<boolean>, thisArg?: any): Promise<boolean>;
	}
}
