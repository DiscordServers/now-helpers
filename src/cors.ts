import {IncomingMessage, ServerResponse} from 'http';
import {RequestHandler, send} from 'micro';

const MAX_AGE       = 60 * 60 * 24;
const ALLOW_METHODS = [
    'POST',
    'GET',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
];

const ALLOW_HEADERS = [
    'X-Requested-With',
    'Access-Control-Allow-Origin',
    'X-HTTP-Method-Override',
    'Content-Type',
    'Authorization',
    'Accept',
];

export default (handler: RequestHandler) => (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS.join(','));
        res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS.join(','));
        res.setHeader('Access-Control-Max-Age', String(MAX_AGE));
        res.setHeader('Content-Length', '0');

        return send(res, 204);
    }

    return handler(req, res);
};
