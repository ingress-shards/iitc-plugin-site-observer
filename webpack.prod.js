import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import { merge } from 'webpack-merge';
import baseProdConfig from 'iitcpluginkit/config/webpack.prod.js';
import pluginJson from './plugin.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default merge(baseProdConfig, {
    context: path.resolve(__dirname),
    resolve: {
        symlinks: false,
        alias: {
            'temporal-polyfill': path.resolve(__dirname, 'node_modules/temporal-polyfill'),
        }
    },
    resolveLoader: {
        modules: ['node_modules', path.resolve(__dirname, 'node_modules/iitcpluginkit/node_modules')],
    },
    mode: 'production',
    devtool: false,
    optimization: {
        usedExports: true,
        sideEffects: true,
        minimize: true,
    },
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename],
        },
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.APP_ENV': JSON.stringify('prod'),
            'process.env.DATABASE_NAME': JSON.stringify('iitc_site-observer'),
            'process.env.PLUGIN_ICON': JSON.stringify(pluginJson.icon),
        })
    ],
});