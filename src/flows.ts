export interface Flow {
  id: string;
  intent: string;
  start_url: string;
  steps: string[];
}

export const flows: Flow[] = [
  {
    id: 'saucedemo_checkout',
    intent: 'Log in as standard_user and complete a checkout. Every product image should load and the order should confirm.',
    start_url: 'https://www.saucedemo.com/',
    steps: [
      'Log in with username "standard_user" and password "secret_sauce"',
      'Add the first product to the cart',
      'Open the cart and click Checkout',
      'Fill first name, last name and postal code, then continue',
      'Click Finish and confirm the order success page appears',
    ],
  },
  {
    id: 'saucedemo_problem_user',
    intent: 'Log in as problem_user and browse the catalogue. Product images should load and checkout fields should accept input.',
    start_url: 'https://www.saucedemo.com/',
    steps: [
      'Log in with username "problem_user" and password "secret_sauce"',
      'Check that each product thumbnail shows the correct product image',
      'Add a product to the cart and start checkout',
      'Type a first and last name into the checkout form',
    ],
  },
  {
    id: 'internet_broken_images',
    intent: 'Open the broken images page. All images on the page should load successfully.',
    start_url: 'https://the-internet.herokuapp.com/broken_images',
    steps: [
      'Check that every image on the page loads and is not broken',
    ],
  },
  {
    id: 'internet_dynamic_loading',
    intent: 'Trigger the dynamic loading example and read the text that appears after the spinner finishes.',
    start_url: 'https://the-internet.herokuapp.com/dynamic_loading/1',
    steps: [
      'Click Start',
      'Wait for the spinner to finish, then read the revealed text "Hello World!"',
    ],
  },
  {
    id: 'internet_login',
    intent: 'Log into the secure area with valid credentials and confirm you reached the authenticated page.',
    start_url: 'https://the-internet.herokuapp.com/login',
    steps: [
      'Log in with username "tomsmith" and password "SuperSecretPassword!"',
      'Confirm you reached the secure area',
    ],
  },
];
