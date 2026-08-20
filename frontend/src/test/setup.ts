import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sem isso, o DOM de um teste sobrevive para o seguinte e um getByText passa
// a encontrar dois elementos iguais.
afterEach(cleanup)
