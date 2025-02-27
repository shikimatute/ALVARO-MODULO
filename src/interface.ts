export interface ObjectRoom {
  room: string; //room
  objectCount: number;
  objectAnalisis: string; //caracteristicas
  questionObject: {
    question: string;
    contextoIA: string; //pregunta
    imgs: string[];
  }[];
}

export interface Caracteristica {
  nombre: string;
  terminaciones: any[]; // Aquí podrías definir un tipo más específico si lo deseas
  respuestaChatGPT?: any; // Campo opcional para agregar la respuesta
}
