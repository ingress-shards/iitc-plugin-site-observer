import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const webpack = require('webpack');
const { merge } = require('webpack-merge');
const pkg = require('./package.json');

const baseProdConfig = require('iitcpluginkit/config/webpack.prod.js');

export default merge(baseProdConfig, {
    mode: 'production',
    devtool: false,
    plugins: [
        new webpack.DefinePlugin({
            'process.env.APP_ENV': JSON.stringify('production'),
            'process.env.DATABASE_NAME': JSON.stringify('iitc_shards-observer'),
            'process.env.CONFIG_BASE_URL': JSON.stringify('https://neon-ninja.github.io/shards'),
        })
    ],
});