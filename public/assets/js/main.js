const button = document.getElementById('button')

button.addEventListener('click', () => {
  fetch('http://localhost:3000/login/0779845287/Beebee22', {
    method: 'POST',
  })
    .then((response) => response.json())
    .then((data) => console.log(data))
})
