import { ConvexError } from 'convex/values';

export function cleanError(error: unknown) {
  if (error instanceof ConvexError) {
    const data = error.data;
    if (typeof data === 'string') return data.slice(0, 240);
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') return data.message.slice(0, 240);
    return 'Something went wrong. Please try again.';
  }
  const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  return message.replace(/\[CONVEX[^\]]*\]\s*/g, '').replace(/\[Request ID:[^\]]*\]\s*/g, '').replace(/Server Error\s*/g, '').replace(/^(?:(?:Uncaught\s+)?(?:Error|ConvexError):\s*)+/, '').split('\n')[0].slice(0, 240);
}
