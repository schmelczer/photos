export default {
  extends: ['stylelint-config-standard-scss'],
  rules: {
    'selector-id-pattern': null,
    'selector-class-pattern':
      '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$',
    'scss/dollar-variable-pattern': null,
  },
};
