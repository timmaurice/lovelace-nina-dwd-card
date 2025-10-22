import process from 'node:process';
import path from 'node:path';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import nodeResolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import { compile } from 'sass';
import litCss from 'rollup-plugin-lit-css';
import pkg from './package.json' with { type: 'json' };

const dev = process.env.ROLLUP_WATCH === 'true';

function logCardInfo() {
  const part1 = `⚠️ ${pkg.name.toUpperCase().replace(/-/g, ' ')}`;
  const part2 = `v${pkg.version}`;
  const part1Style =
    'color: orange; font-weight: bold; background: black; padding: 2px 4px; border-radius: 2px 0 0 2px;';
  const part2Style =
    'color: white; font-weight: bold; background: dimgray; padding: 2px 4px; border-radius: 0 2px 2px 0;';
  const repo = `Github:  ${pkg.repository.url}`;
  const sponsor = 'Sponsor: https://buymeacoffee.com/timmaurice';

  return `
    console.groupCollapsed(
      '%c${part1}%c${part2}',
      '${part1Style}',
      '${part2Style}'
    );
    console.info("${pkg.description}");
    console.info('${repo}');
    console.info('${sponsor}');
    console.groupEnd();
  `;
}

export default {
  input: 'src/nina-dwd-card.ts',
  context: 'window', // Fix for "this" being undefined in some modules
  output: {
    file: pkg.main,
    format: 'es',
    sourcemap: dev, // Keep sourcemaps for debugging in dev mode
    banner: logCardInfo(),
    inlineDynamicImports: true,
  },
  plugins: [
    nodeResolve(),
    litCss({
      include: ['**/*.scss'],
      transform: (data, { filePath }) => {
        const result = compile(filePath, {
          style: dev ? 'expanded' : 'compressed',
          loadPaths: [path.dirname(filePath)],
        });
        return result.css.toString();
      },
    }),
    json({ compact: true }),
    typescript({
      sourceMap: dev,
      inlineSources: dev,
    }),
    !dev && terser(),
  ],
};
