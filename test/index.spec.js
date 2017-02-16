const { expect } = require('chai');
const Inferno = require('inferno');
const Component = require('inferno-component');
const createClass = require('inferno-create-class');
const InfernoServer = require('inferno-server');
const ExecutionEnvironment = require('exenv');
const jsdom = require('jsdom');
const { renderIntoDocument, findRenderedVNodeWithType } = require('inferno-test-utils');

const withSideEffect = require('../src');

function noop() { }
const identity = x => x

describe('inferno-side-effect', () => {
  describe('argument validation', () => {
    it('should throw if no reducePropsState function is provided', () => {
      expect(withSideEffect).to.throw('Expected reducePropsToState to be a function.');
    });

    it('should throw if no handleStateChangeOnClient function is provided', () => {
      expect(withSideEffect.bind(null, noop)).to.throw('Expected handleStateChangeOnClient to be a function.');
    });

    it('should throw if mapStateOnServer is defined but not a function', () => {
      expect(withSideEffect.bind(null, noop, noop, 'foo')).to.throw('Expected mapStateOnServer to either be undefined or a function.');
    });

    it('should throw if no WrappedComponent is provided', () => {
      expect(withSideEffect(noop, noop)).to.throw('Expected WrappedComponent to be an Inferno component');
    });
  });

  describe('displayName', () => {
    const withNoopSideEffect = withSideEffect(noop, noop);

    it('should wrap the displayName of wrapped createClass component', () => {
      const DummyComponent = createClass({displayName: 'Dummy', render: noop});
      const SideEffect = withNoopSideEffect(DummyComponent);

      expect(SideEffect.displayName).to.equal('SideEffect(Dummy)');
    });

    it('should wrap the displayName of wrapped ES2015 class component', () => {
      class DummyComponent extends Component {
        static displayName = 'Dummy'
        render() {}
      }
      const SideEffect = withNoopSideEffect(DummyComponent);

      expect(SideEffect.displayName).to.equal('SideEffect(Dummy)');
    });

    it('should use the constructor name of the wrapped functional component', () => {
      function DummyComponent() {}

      const SideEffect = withNoopSideEffect(DummyComponent);

      expect(SideEffect.displayName).to.equal('SideEffect(DummyComponent)');
    });

    it('should fallback to "Component"', () => {
      const DummyComponent = createClass({displayName: null, render: noop});
      const SideEffect = withNoopSideEffect(DummyComponent);

      expect(SideEffect.displayName).to.equal('SideEffect(Component)');
    });
  });

  describe('SideEffect component', () => {
    class DummyComponent extends Component {
      render () {
        return <div>hello {this.props.foo}</div>
      }
    };

    const withIdentitySideEffect = withSideEffect(identity, noop);
    let SideEffect;

    beforeEach(() => {
      SideEffect = withIdentitySideEffect(DummyComponent);
    });

    it('should expose the canUseDOM flag', () => {
      expect(SideEffect).to.have.property('canUseDOM', ExecutionEnvironment.canUseDOM);
    });

    describe('rewind', () => {
      it('should throw if used in the browser', () => {
        SideEffect.canUseDOM = true;
        expect(SideEffect.rewind).to.throw('You may only call rewind() on the server. Call peek() to read the current state.');
      });

      it('should return the current state', () => {
        InfernoServer.renderToString(<SideEffect foo="bar"/>);
        const state = SideEffect.rewind();
        expect(state).to.deep.equal([{foo: 'bar'}]);
      });

      it('should reset the state', () => {
        InfernoServer.renderToString(<SideEffect foo="bar"/>);
        SideEffect.rewind();
        const state = SideEffect.rewind();
        expect(state).to.equal(undefined);
      });
    });

    describe('peek', () => {
      it('should return the current state', () => {
        InfernoServer.renderToString(<SideEffect foo="bar"/>);
        expect(SideEffect.peek()).to.deep.equal([{foo: 'bar'}]);
      });

      it('should NOT reset the state', () => {
        InfernoServer.renderToString(<SideEffect foo="bar"/>);

        SideEffect.peek();
        const state = SideEffect.peek();

        expect(state).to.deep.equal([{foo: 'bar'}]);
      });
    });

    describe('handleStateChangeOnClient', () => {
      it('should execute handleStateChangeOnClient', () => {
        let sideEffectCollectedData;

        const handleStateChangeOnClient = state => (sideEffectCollectedData = state)

        SideEffect = withSideEffect(identity, handleStateChangeOnClient)(DummyComponent);

        SideEffect.canUseDOM = true;

        InfernoServer.renderToString(<SideEffect foo="bar"/>);

        expect(sideEffectCollectedData).to.deep.equal([{foo: 'bar'}]);
      });
    });

    describe('mapStateOnServer', () => {
      it('should apply a custom mapStateOnServer function', () => {
        const mapStateOnServer = ([ prop ]) => prop

        SideEffect = withSideEffect(identity, noop, mapStateOnServer)(DummyComponent);

        SideEffect.canUseDOM = false;

        InfernoServer.renderToString(<SideEffect foo="bar"/>);

        let state = SideEffect.rewind();

        expect(state).not.to.be.an('Array');
        expect(state).to.deep.equal({foo: 'bar'});

        SideEffect.canUseDOM = true;

        InfernoServer.renderToString(<SideEffect foo="bar"/>);

        state = SideEffect.peek();

        expect(state).to.an('Array');
        expect(state).to.deep.equal([{foo: 'bar'}]);
      });
    });

    it('should collect props from all instances', () => {
      InfernoServer.renderToString(<SideEffect foo="bar"/>);
      InfernoServer.renderToString(<SideEffect something="different"/>);

      const state = SideEffect.peek();

      expect(state).to.deep.equal([{foo: 'bar'}, {something: 'different'}]);
    });

    it('should render the wrapped component', () => {
      const markup = InfernoServer.renderToStaticMarkup(<SideEffect foo="bar"/>);

      expect(markup).to.equal('<div>hello <!---->bar</div>');
    });

    describe('with DOM', () => {
      const originalWindow = global.window;
      const originalDocument = global.document;

      before(done => {
        jsdom.env('<!doctype html><html><head></head><body></body></html>', (error, window) => {
          if (!error) {
            global.window = window;
            global.document = window.document;
          }

          done(error);
        });
      });

      after(() => {
        global.window = originalWindow;
        global.document = originalDocument;
      });

      it('should only recompute when component updates', () => {
        let collectCount = 0;

        function handleStateChangeOnClient(state) {
          collectCount += 1;
        }

        SideEffect = withSideEffect(identity, handleStateChangeOnClient)(DummyComponent);

        SideEffect.canUseDOM = true;

        const node = document.createElement('div');
        document.body.appendChild(node);

        Inferno.render(<SideEffect text="bar" />, node);
        expect(collectCount).to.equal(1);
        Inferno.render(<SideEffect text="bar" />, node);
        expect(collectCount).to.equal(1);
        Inferno.render(<SideEffect text="baz" />, node);
        expect(collectCount).to.equal(2);
        Inferno.render(<SideEffect text="baz" />, node);
        expect(collectCount).to.equal(2);
      });
    });
  });
});
