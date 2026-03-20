export const pokemonHoneypot = () => {
    const id = Math.floor(Math.random() * 151) + 1;
    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://pokeapi.co/api/v2/pokemon/${id}`,
      },
    });
};