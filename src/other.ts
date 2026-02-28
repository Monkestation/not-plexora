import { access } from "node:fs/promises";
/**
 * Returns a human friendly UTC date which is not actually accurate but good enough for a human to read.
 */
export function getFilenameFriendlyUTCDate(date = new Date()): string {
	const year = String(date.getUTCFullYear());
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	const hours = String(date.getUTCHours()).padStart(2, "0");
	const minutes = String(date.getUTCMinutes()).padStart(2, "0");
	const seconds = String(date.getUTCSeconds()).padStart(2, "0");

	return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_UTC`;
}

/**
 * @returns Formatted time
 */
export function getTimeText(wtime: number, format: string): string {
	const hour = Math.floor(wtime / 3600);
	const minute = Math.floor((wtime - hour * 3600) / 60);
	const second = Math.floor(wtime - hour * 3600 - minute * 60);

	if (format === "simple") {
		const formattedHour = hour.toString().padStart(2, "0");
		const formattedMinute = minute.toString().padStart(2, "0");
		const formattedSecond = second.toString().padStart(2, "0");

		return `${formattedHour}:${formattedMinute}:${formattedSecond}`;
	}

	return `${hour}h ${minute}m ${second}s`;
}

export function sleep(ms: number | undefined): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const pickRandomInArray = (array: string | any[]) => array[Math.floor(Math.random() * array.length)];

export const parseByondKey = (key: string) => {
	const keyReplacePattern = /[^\da-z]/g;
	return key.toLowerCase().replaceAll(keyReplacePattern, "").trim();
};

// safe fs.promises.access
export async function safeAccess(path: string) {
	try {
		await access(path);
		return true;
	} catch (_error) {
		return false;
	}
}
