import babel from 'rollup-plugin-babel'
import uglify from 'rollup-plugin-uglify'
import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'

const { BUILD_ENV, BUILD_FORMAT } = process.env

const config = {
  input: 'src/index.js',
  output: {
    name: 'withSideEffect',
    globals: {
      inferno: 'Inferno',
    },
  },
  plugins: [
    babel({
      babelrc: false,
      presets: [['env', { loose: true, modules: false }]],
      plugins: [
        'inferno',
        'transform-object-rest-spread',
        'transform-class-properties',
      ],
      exclude: 'node_modules/**',
    }),
  ],
  external: ['shallowequal', 'inferno', 'exenv'],
}

if (BUILD_FORMAT === 'umd') {
  // In the browser build, include our smaller dependencies
  // so users only need to include Inferno
  config.external = ['inferno']
  config.plugins.push(
    resolve(),
    commonjs({
      include: /node_modules/,
    }),
  )
}

if (BUILD_ENV === 'production') {
  config.plugins.push(uglify())
}

export default config
