import { httpRouter } from 'convex/server';
import { serve } from './hosting';

const http = httpRouter();
http.route({ pathPrefix: '/', method: 'GET', handler: serve });

export default http;
